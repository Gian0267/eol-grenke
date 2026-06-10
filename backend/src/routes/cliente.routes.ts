import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import Handlebars from 'handlebars';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  verifyClienteToken,
  ClienteAuthenticatedRequest,
} from '../middleware/cliente.middleware.js';
import { createEmailProvider } from '../providers/notification/email.provider.js';
import { generateOtp, verifyOtp } from '../services/otp.service.js';
import { generaVerbaleRestituzione } from '../services/pdf.service.js';
import { MockFeaProvider } from '../providers/signature/fea.provider.js';
import {
  initiatePayment,
  verifyPayment as verifyPaymentService,
  handlePaymentCallback,
} from '../services/payment.service.js';
import { generaConfermaRinnovo, PrequalificazioneRinnovo } from '../services/pdf.service.js';
import { loadDocument } from '../services/storage.service.js';
import { assegnaPratica } from '../services/assignment.service.js';
import { registraEvento } from '../services/audit.service.js';
import { prisma } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();
const emailProvider = createEmailProvider();

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi OTP, riprova tra 10 minuti' },
});

const contattoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppe richieste di contatto, riprova tra 5 minuti' },
});

const configDir = resolve(__dirname, '../../../config');
const templateDir = resolve(__dirname, '../../../templates/email');
const pricingRules = JSON.parse(readFileSync(resolve(configDir, 'pricing_rules.json'), 'utf-8'));

const notificaTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'notifica_richiesta_contatto.html'), 'utf-8'),
);
const confermaRestituzioneTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'conferma_restituzione.html'), 'utf-8'),
);
const confermaRinnovoTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'conferma_rinnovo.html'), 'utf-8'),
);
const notificaAgenteRinnovoTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'notifica_agente_rinnovo.html'), 'utf-8'),
);
const notificaAgenteContattoTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'notifica_agente_contatto.html'), 'utf-8'),
);

const feaProvider = new MockFeaProvider();

// I3 fix: shared deadline calculation
function calcolaDeadline(dataScadenza: Date): Date {
  const offsetDays = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
  return new Date(dataScadenza.getTime() - offsetDays * 24 * 60 * 60 * 1000);
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// I4 fix: IVA a margine — l'IVA si calcola solo sul margine (riacquisto - grenke), non sul prezzo pieno
function calcolaIvaAMargine(
  prezzoVendita: Prisma.Decimal,
  margine: Prisma.Decimal,
  ivaPerc: number,
): { iva: number; totale: number } {
  const centMargine = Math.round(Number(margine) * 100);
  const ivaCentesimi = Math.round(centMargine * ivaPerc);
  const centVendita = Math.round(Number(prezzoVendita) * 100);
  return {
    iva: ivaCentesimi / 100,
    totale: (centVendita + ivaCentesimi) / 100,
  };
}

// GET /api/cliente/pratica
router.get('/pratica', verifyClienteToken, async (req: ClienteAuthenticatedRequest, res: Response) => {
  try {
    const contratto = await prisma.contratto_EOL.findUnique({
      where: { id: req.contrattoEolId },
      include: {
        cliente: true,
        agente_originario: true,
      },
    });

    if (!contratto) {
      res.status(404).json({ errore: 'Contratto non trovato' });
      return;
    }

    await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'LINK_APERTO_DAL_CLIENTE', {
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
      user_agent: req.headers['user-agent'] || 'unknown',
    });

    const ivaPerc = pricingRules.iva_percentuale as number;
    const { iva, totale } = calcolaIvaAMargine(contratto.pricing_riacquisto, contratto.margine_lordo, ivaPerc);

    const dataScadenza = new Date(contratto.data_scadenza);
    const deadlineDecisione = calcolaDeadline(dataScadenza);

    let beni: Array<{ descrizione?: string }> = [];
    try {
      beni = JSON.parse(contratto.beni_json);
    } catch {}

    // Leggi feature flag gift card dal config service
    const configService = await import('../services/config.service.js');
    const abilitaGiftCard = await configService.getBooleano('flags.abilita_gift_card', true);

    res.json({
      cliente: {
        ragione_sociale: contratto.cliente.ragione_sociale,
        piva: contratto.cliente.piva,
        citta: contratto.cliente.citta || null,
      },
      contratto: {
        numero_nsm: contratto.contratto_nsm_id,
        numero_grenke: contratto.contratto_grenke_id,
        data_scadenza: contratto.data_scadenza,
        beni: beni.map((b) => b.descrizione || 'N/D'),
        monte_canoni: Number(contratto.monte_canoni),
        stato: contratto.stato,
      },
      economica: {
        pricing_riacquisto: Number(contratto.pricing_riacquisto),
        pricing_riacquisto_iva: iva,
        pricing_riacquisto_totale: totale,
        valore_gift_card: Number(contratto.valore_gift_card),
        abilita_gift_card: abilitaGiftCard,
      },
      deadline_decisione: deadlineDecisione.toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/cliente/pratica] Errore:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// POST /api/cliente/richiesta-contatto
const richiestaContattoSchema = z.object({
  nome: z.string().min(1),
  telefono: z.string().regex(/^[\d\s+\-.()]{5,20}$/, 'Formato telefono non valido'),
  giorno_preferito: z.string().optional().default(''),
  fascia_oraria: z.enum(['MATTINA', 'POMERIGGIO', 'INDIFFERENTE']).optional().default('INDIFFERENTE'),
});

router.post(
  '/richiesta-contatto',
  contattoLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = richiestaContattoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const { nome, telefono, giorno_preferito, fascia_oraria } = parsed.data;

      // B3 fix: deduplica — max 1 richiesta DA_GESTIRE per contratto nelle ultime 24h
      const esistente = await prisma.richiesta_Contatto.findFirst({
        where: {
          contratto_eol_id: req.contrattoEolId,
          stato: 'DA_GESTIRE',
          created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (esistente) {
        res.status(429).json({
          errore: 'Richiesta già presente. Verrai ricontattato a breve.',
        });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: {
          cliente: true,
          agente_originario: true,
        },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const { agenteAssegnatoId, motivoAssegnazione } = await assegnaPratica(contratto.id);

      const richiesta = await prisma.richiesta_Contatto.create({
        data: {
          contratto_eol_id: contratto.id,
          origine: 'WIDGET_CHIAMAMI',
          nome_referente: nome,
          telefono,
          giorno_preferito,
          fascia_oraria,
          agente_assegnato_id: agenteAssegnatoId,
          stato: 'DA_GESTIRE',
        },
      });

      // B4 fix: handle email failure, log result, create Comunicazione record
      if (agenteAssegnatoId) {
        const agente = await prisma.utente_NSM.findUnique({
          where: { id: agenteAssegnatoId },
        });

        if (agente) {
          const html = notificaTemplate({
            ragione_sociale: contratto.cliente.ragione_sociale,
            contratto_nsm: contratto.contratto_nsm_id,
            nome_referente: nome,
            telefono,
            giorno_preferito: giorno_preferito || 'Non specificato',
            fascia_oraria,
            monte_canoni: formatEur(Number(contratto.monte_canoni)),
            motivo_assegnazione: motivoAssegnazione,
          });

          const oggetto = `Richiesta contatto: ${contratto.cliente.ragione_sociale} — ${contratto.contratto_nsm_id}`;
          const sendResult = await emailProvider.send(agente.email, oggetto, html);

          await prisma.comunicazione.create({
            data: {
              contratto_eol_id: contratto.id,
              tipo: 'NOTIFICA_RICHIESTA_CONTATTO',
              canale: 'EMAIL',
              destinatario: agente.email,
              oggetto,
              corpo_html: html,
              data_invio: new Date(),
              esito_invio: sendResult.success ? 'INVIATO' : 'ERRORE',
            },
          });

          if (!sendResult.success) {
            console.error(`[richiesta-contatto] Email non inviata a ${agente.email}: ${sendResult.error}`);
          }
        }
      }

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'RICHIESTA_CONTATTO_CREATA', {
        origine: 'WIDGET_CHIAMAMI',
        richiesta_id: richiesta.id,
      });

      res.json({
        success: true,
        messaggio: 'Richiesta registrata. Ti richiameremo entro 24 ore.',
        richiesta_id: richiesta.id,
      });
    } catch (err) {
      console.error('[POST /api/cliente/richiesta-contatto] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// POST /api/cliente/decisione/restituzione/inizia
const iniziaRestituzioneSchema = z.object({
  metodo: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/restituzione/inizia',
  otpLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = iniziaRestituzioneSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Metodo OTP non valido', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const statiValidi = ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'LISTA_RICEVUTA'];
      if (!statiValidi.includes(contratto.stato)) {
        res.status(400).json({ errore: `Stato pratica non valido: ${contratto.stato}` });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { metodo } = parsed.data;
      const destinatario = metodo === 'EMAIL' ? contratto.cliente.email : (contratto.cliente.telefono || contratto.cliente.email);

      await generateOtp(metodo, destinatario);

      if (contratto.stato !== 'IN_ATTESA_DECISIONE') {
        await prisma.contratto_EOL.update({
          where: { id: contratto.id },
          data: { stato: 'IN_ATTESA_DECISIONE' },
        });
      }

      res.json({ success: true, messaggio: `Codice OTP inviato via ${metodo}`, destinatario_mascherato: destinatario.replace(/(.{3}).*(@.*)/, '$1***$2') });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/restituzione/inizia] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// POST /api/cliente/decisione/restituzione/conferma
const confermaRestituzioneSchema = z.object({
  codice: z.string().length(6),
  metodo: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/restituzione/conferma',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = confermaRestituzioneSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { codice, metodo } = parsed.data;
      const destinatario = metodo === 'EMAIL' ? contratto.cliente.email : (contratto.cliente.telefono || contratto.cliente.email);

      const otpResult = await verifyOtp(metodo, destinatario, codice);
      if (!otpResult.valid) {
        res.status(400).json({ errore: otpResult.errore });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'OTP_VERIFICATO', {
        metodo, opzione: 'RESTITUZIONE',
      });

      const decisione = await prisma.decisione_Cliente.create({
        data: {
          contratto_eol_id: contratto.id,
          opzione_scelta: 'RESTITUZIONE',
          otp_verificato: true,
          otp_metodo: metodo,
          ip_address: ip,
          user_agent: userAgent,
        },
      });

      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: { stato: 'CHIUSA_RESTITUZIONE_CONFERMATA' },
      });

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'DECISIONE_PRESA', {
        opzione: 'RESTITUZIONE', decisione_id: decisione.id, ip,
      });

      await registraEvento(contratto.id, 'SISTEMA', 'SISTEMA', 'PRATICA_CHIUSA', {
        stato_finale: 'CHIUSA_RESTITUZIONE_CONFERMATA',
      });

      const { hash, buffer: pdfBuffer } = await generaVerbaleRestituzione(contratto.id, decisione.id, {
        nome: contratto.cliente.ragione_sociale,
        ip,
        userAgent,
        otpVerificato: true,
      });

      await feaProvider.requestSignature(pdfBuffer, {
        nome: contratto.cliente.ragione_sociale,
        ip,
        userAgent,
        otpVerificato: true,
      });

      let beni: Array<{ descrizione?: string }> = [];
      try { beni = JSON.parse(contratto.beni_json); } catch {}

      const html = confermaRestituzioneTemplate({
        ragione_sociale: contratto.cliente.ragione_sociale,
        numero_contratto_nsm: contratto.contratto_nsm_id,
        numero_contratto_grenke: contratto.contratto_grenke_id,
        data_scadenza: new Date(contratto.data_scadenza).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        beni: beni.map(b => b.descrizione || 'N/D').join(', ') || 'Come da contratto',
      });

      const oggetto = `Conferma restituzione beni — Contratto ${contratto.contratto_nsm_id}`;

      await emailProvider.sendWithAttachment(
        contratto.cliente.email,
        oggetto,
        html,
        [{ filename: `verbale_restituzione_${contratto.contratto_nsm_id}.pdf`, content: pdfBuffer }],
      );

      await prisma.comunicazione.create({
        data: {
          contratto_eol_id: contratto.id,
          tipo: 'CONFERMA_RESTITUZIONE',
          canale: 'EMAIL',
          destinatario: contratto.cliente.email,
          oggetto,
          corpo_html: html,
          data_invio: new Date(),
          esito_invio: 'INVIATO',
        },
      });

      res.json({
        success: true,
        messaggio: 'Restituzione confermata',
        decisione_id: decisione.id,
        pdf_hash: hash,
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/restituzione/conferma] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// GET /api/cliente/decisione/pdf — download del verbale PDF
router.get(
  '/decisione/pdf',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const decisione = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: req.contrattoEolId },
      });

      if (!decisione?.pdf_conferma_path) {
        res.status(404).json({ errore: 'PDF non trovato' });
        return;
      }

      const pdf = await loadDocument(decisione.pdf_conferma_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="verbale_restituzione.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error('[GET /api/cliente/decisione/pdf] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// ===== RIACQUISTO ROUTES =====

// POST /api/cliente/decisione/riacquisto/inizia
const iniziaRiacquistoSchema = z.object({
  choice: z.enum(['contattatemi', 'procedi']),
  nome: z.string().optional(),
  telefono: z.string().optional(),
  giorno_preferito: z.string().optional(),
  fascia_oraria: z.enum(['MATTINA', 'POMERIGGIO', 'INDIFFERENTE']).optional(),
});

router.post(
  '/decisione/riacquisto/inizia',
  otpLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = iniziaRiacquistoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true, agente_originario: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const statiValidi = ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'LISTA_RICEVUTA'];
      if (!statiValidi.includes(contratto.stato)) {
        res.status(400).json({ errore: `Stato pratica non valido per riacquisto: ${contratto.stato}` });
        return;
      }

      const { choice } = parsed.data;

      if (choice === 'contattatemi') {
        const { nome, telefono, giorno_preferito, fascia_oraria } = parsed.data;
        if (!nome || !telefono) {
          res.status(400).json({ errore: 'Nome e telefono obbligatori per richiesta contatto' });
          return;
        }

        const { agenteAssegnatoId } = await assegnaPratica(contratto.id);

        await prisma.richiesta_Contatto.create({
          data: {
            contratto_eol_id: contratto.id,
            origine: 'STEP_PRE_PAGAMENTO',
            nome_referente: nome,
            telefono,
            giorno_preferito: giorno_preferito || '',
            fascia_oraria: fascia_oraria || 'INDIFFERENTE',
            agente_assegnato_id: agenteAssegnatoId,
            stato: 'DA_GESTIRE',
          },
        });

        await prisma.contratto_EOL.update({
          where: { id: contratto.id },
          data: { stato: 'RIACQUISTO_IN_ATTESA_CHIAMATA' },
        });

        // Notifica agente
        if (agenteAssegnatoId) {
          const agente = await prisma.utente_NSM.findUnique({ where: { id: agenteAssegnatoId } });
          if (agente) {
            const html = notificaTemplate({
              ragione_sociale: contratto.cliente.ragione_sociale,
              contratto_nsm: contratto.contratto_nsm_id,
              nome_referente: nome,
              telefono,
              giorno_preferito: giorno_preferito || 'Non specificato',
              fascia_oraria: fascia_oraria || 'INDIFFERENTE',
              monte_canoni: formatEur(Number(contratto.monte_canoni)),
              motivo_assegnazione: 'step_pre_pagamento',
            });
            await emailProvider.send(
              agente.email,
              `Richiesta contatto pre-pagamento: ${contratto.cliente.ragione_sociale}`,
              html,
            );
          }
        }

        await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'RICHIESTA_CONTATTO_CREATA', {
          origine: 'STEP_PRE_PAGAMENTO',
        });

        res.json({
          success: true,
          choice: 'contattatemi',
          messaggio: 'Ti contatteremo a breve. Riceverai un\'email per riprendere il pagamento.',
        });
      } else {
        // choice === 'procedi'
        if (contratto.stato !== 'IN_ATTESA_DECISIONE') {
          await prisma.contratto_EOL.update({
            where: { id: contratto.id },
            data: { stato: 'IN_ATTESA_DECISIONE' },
          });
        }

        const ivaPerc = pricingRules.iva_percentuale as number;
        const { iva, totale } = calcolaIvaAMargine(contratto.pricing_riacquisto, contratto.margine_lordo, ivaPerc);

        res.json({
          success: true,
          choice: 'procedi',
          pricing: {
            netto: Number(contratto.pricing_riacquisto),
            iva,
            totale,
          },
        });
      }
    } catch (err) {
      console.error('[POST /api/cliente/decisione/riacquisto/inizia] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// POST /api/cliente/decisione/riacquisto/conferma-tc
const confermaTcSchema = z.object({
  codice: z.string().length(6),
  metodo: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/riacquisto/conferma-tc',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = confermaTcSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });
      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const { codice, metodo } = parsed.data;
      const destinatario = metodo === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      const otpResult = await verifyOtp(metodo, destinatario, codice);
      if (!otpResult.valid) {
        res.status(400).json({ errore: otpResult.errore });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'OTP_VERIFICATO', {
        metodo, opzione: 'RIACQUISTO',
      });

      const decisione = await prisma.decisione_Cliente.create({
        data: {
          contratto_eol_id: contratto.id,
          opzione_scelta: 'RIACQUISTO',
          otp_verificato: true,
          otp_metodo: metodo,
          ip_address: ip,
          user_agent: userAgent,
        },
      });

      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: { stato: 'DECISIONE_RIACQUISTO_IN_CORSO' },
      });

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'DECISIONE_PRESA', {
        opzione: 'RIACQUISTO', decisione_id: decisione.id, ip,
      });

      // Determina se il pagamento è immediato o differito (T-7)
      const configService = await import('../services/config.service.js');
      const giorniPagamento = await configService.getNumero('timeline.pagamento_riacquisto', 7);
      const oggi = new Date();
      const scadenza = new Date(contratto.data_scadenza);
      const diffMs = scadenza.getTime() - oggi.getTime();
      const giorniAllaScadenza = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      if (giorniAllaScadenza <= giorniPagamento) {
        // Pagamento immediato: siamo già entro T-7
        res.json({ success: true, decisione_id: decisione.id, pagamento_immediato: true });
      } else {
        // Pagamento differito: invieremo il link a T-7
        const dataPagamento = new Date(scadenza.getTime() - giorniPagamento * 24 * 60 * 60 * 1000);
        res.json({
          success: true,
          decisione_id: decisione.id,
          pagamento_differito: true,
          data_pagamento: dataPagamento.toISOString(),
        });
      }
    } catch (err) {
      console.error('[POST /api/cliente/decisione/riacquisto/conferma-tc] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// GET /api/cliente/decisione/riacquisto/stato — controlla se il pagamento è disponibile
router.get(
  '/decisione/riacquisto/stato',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true, decisioni: true },
      });
      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const decisioneRiacquisto = contratto.decisioni.find(d => d.opzione_scelta === 'RIACQUISTO');

      if (!decisioneRiacquisto) {
        res.json({ stato: 'NESSUNA_DECISIONE' });
        return;
      }

      if (contratto.stato === 'RIACQUISTO_PAGATO') {
        res.json({ stato: 'GIA_PAGATO' });
        return;
      }

      const configService = await import('../services/config.service.js');
      const giorniPagamento = await configService.getNumero('timeline.pagamento_riacquisto', 7);
      const oggi = new Date();
      const scadenza = new Date(contratto.data_scadenza);
      const diffMs = scadenza.getTime() - oggi.getTime();
      const giorniAllaScadenza = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      if (giorniAllaScadenza <= giorniPagamento) {
        res.json({
          stato: 'PAGAMENTO_DISPONIBILE',
          decisione_id: decisioneRiacquisto.id,
        });
      } else {
        const dataPagamento = new Date(scadenza.getTime() - giorniPagamento * 24 * 60 * 60 * 1000);
        res.json({
          stato: 'PAGAMENTO_DIFFERITO',
          data_pagamento: dataPagamento.toISOString(),
          decisione_id: decisioneRiacquisto.id,
        });
      }
    } catch (err) {
      console.error('[GET /api/cliente/decisione/riacquisto/stato] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// POST /api/cliente/decisione/riacquisto/richiedi-otp
const richiediOtpRiacquistoSchema = z.object({
  metodo: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/riacquisto/richiedi-otp',
  otpLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = richiediOtpRiacquistoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Metodo OTP non valido' });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });
      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const { metodo } = parsed.data;
      const destinatario = metodo === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      await generateOtp(metodo, destinatario);

      res.json({
        success: true,
        messaggio: `Codice OTP inviato via ${metodo}`,
        destinatario_mascherato: destinatario.replace(/(.{3}).*(@.*)/, '$1***$2'),
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/riacquisto/richiedi-otp] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// POST /api/cliente/decisione/riacquisto/scegli-metodo
const scegliMetodoSchema = z.object({
  metodo: z.enum(['FABRICK', 'STRIPE']),
});

router.post(
  '/decisione/riacquisto/scegli-metodo',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = scegliMetodoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Metodo di pagamento non valido' });
        return;
      }

      const { metodo } = parsed.data;
      const result = await initiatePayment(req.contrattoEolId!, metodo);

      res.json({
        success: true,
        session_id: result.session_id,
        importi: result.importi,
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/riacquisto/scegli-metodo] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// GET /api/cliente/pagamento/:session_id/status
router.get(
  '/pagamento/:session_id/status',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const session_id = req.params.session_id as string;
      const result = await verifyPaymentService(session_id);
      res.json(result);
    } catch (err) {
      console.error('[GET /api/cliente/pagamento/:session_id/status] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// GET /api/cliente/pagamento/:pagamento_id/ricevuta — download ricevuta di conferma pagamento PDF
router.get(
  '/pagamento/:pagamento_id/ricevuta',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const pagamentoId = req.params.pagamento_id as string;
      const pagamento = await prisma.pagamento.findFirst({
        where: {
          id: pagamentoId,
          contratto_eol_id: req.contrattoEolId,
        },
      });

      if (!pagamento?.fattura_path) {
        res.status(404).json({ errore: 'Ricevuta non trovata' });
        return;
      }

      const pdf = await loadDocument(pagamento.fattura_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ricevuta_${pagamento.fattura_numero || 'pagamento'}.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error('[GET /api/cliente/pagamento/:pagamento_id/ricevuta] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// ===== RINNOVO ROUTES =====

const iniziaRinnovoSchema = z.object({
  tipo_device: z.enum(['Apple MacBook', 'Apple iPad', 'PC Windows', 'Smartphone', 'Altro']),
  numero_device: z.number().int().min(1).default(1),
  durata_desiderata: z.enum(['24', '36', '48']).transform(Number),
  budget_mensile: z.number().optional(),
  note: z.string().optional(),
  metodo_otp: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/rinnovo/inizia',
  otpLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = iniziaRinnovoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const statiValidi = ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'LISTA_RICEVUTA'];
      if (!statiValidi.includes(contratto.stato)) {
        res.status(400).json({ errore: `Stato pratica non valido: ${contratto.stato}` });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { metodo_otp } = parsed.data;
      const destinatario = metodo_otp === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      await generateOtp(metodo_otp, destinatario);

      if (contratto.stato !== 'IN_ATTESA_DECISIONE') {
        await prisma.contratto_EOL.update({
          where: { id: contratto.id },
          data: { stato: 'IN_ATTESA_DECISIONE' },
        });
      }

      res.json({
        success: true,
        messaggio: `Codice OTP inviato via ${metodo_otp}`,
        destinatario_mascherato: destinatario.replace(/(.{3}).*(@.*)/, '$1***$2'),
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/rinnovo/inizia] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

const confermaRinnovoSchema = z.object({
  codice: z.string().length(6),
  metodo_otp: z.enum(['SMS', 'EMAIL']),
  tipo_device: z.enum(['Apple MacBook', 'Apple iPad', 'PC Windows', 'Smartphone', 'Altro']),
  numero_device: z.number().int().min(1).default(1),
  durata_desiderata: z.number().int(),
  budget_mensile: z.number().optional(),
  note: z.string().optional(),
});

router.post(
  '/decisione/rinnovo/conferma',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = confermaRinnovoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true, agente_originario: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { codice, metodo_otp, tipo_device, numero_device, durata_desiderata, budget_mensile, note } = parsed.data;
      const destinatario = metodo_otp === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      const otpResult = await verifyOtp(metodo_otp, destinatario, codice);
      if (!otpResult.valid) {
        res.status(400).json({ errore: otpResult.errore });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'OTP_VERIFICATO', {
        metodo: metodo_otp, opzione: 'RINNOVO',
      });

      const prequalificazione: PrequalificazioneRinnovo = {
        tipo_device,
        numero_device,
        durata_desiderata,
        budget_mensile,
        note,
      };

      const decisione = await prisma.decisione_Cliente.create({
        data: {
          contratto_eol_id: contratto.id,
          opzione_scelta: 'RINNOVO',
          otp_verificato: true,
          otp_metodo: metodo_otp,
          ip_address: ip,
          user_agent: userAgent,
          note_cliente: JSON.stringify(prequalificazione),
        },
      });

      // Assegna agente
      const { agenteAssegnatoId, motivoAssegnazione } = await assegnaPratica(contratto.id);

      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: {
          stato: 'DECISIONE_RINNOVO',
          agente_assegnato_id: agenteAssegnatoId,
        },
      });

      // Genera PDF conferma rinnovo
      const { hash, buffer: pdfBuffer } = await generaConfermaRinnovo(
        contratto.id,
        decisione.id,
        prequalificazione,
        { nome: contratto.cliente.ragione_sociale, ip, userAgent, otpVerificato: true },
      );

      // Invia email al cliente con PDF allegato
      let beni: Array<{ descrizione?: string }> = [];
      try { beni = JSON.parse(contratto.beni_json); } catch {}

      const htmlCliente = confermaRinnovoTemplate({
        ragione_sociale: contratto.cliente.ragione_sociale,
        numero_contratto_nsm: contratto.contratto_nsm_id,
        numero_contratto_grenke: contratto.contratto_grenke_id,
        tipo_device,
        numero_device,
        durata_desiderata,
        budget_mensile: budget_mensile ? formatEur(budget_mensile) : null,
        note: note || null,
        valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
      });

      const oggettoCliente = `Conferma richiesta rinnovo — Contratto ${contratto.contratto_nsm_id}`;

      const sendCliente = await emailProvider.sendWithAttachment(
        contratto.cliente.email,
        oggettoCliente,
        htmlCliente,
        [{ filename: `conferma_rinnovo_${contratto.contratto_nsm_id}.pdf`, content: pdfBuffer }],
      );

      await prisma.comunicazione.create({
        data: {
          contratto_eol_id: contratto.id,
          tipo: 'CONFERMA_RINNOVO',
          canale: 'EMAIL',
          destinatario: contratto.cliente.email,
          oggetto: oggettoCliente,
          corpo_html: htmlCliente,
          data_invio: new Date(),
          esito_invio: sendCliente.success ? 'INVIATO' : 'ERRORE',
        },
      });

      // Notifica agente assegnato
      if (agenteAssegnatoId) {
        const agente = await prisma.utente_NSM.findUnique({ where: { id: agenteAssegnatoId } });
        if (agente) {
          const htmlAgente = notificaAgenteRinnovoTemplate({
            ragione_sociale: contratto.cliente.ragione_sociale,
            contratto_nsm: contratto.contratto_nsm_id,
            email_cliente: contratto.cliente.email,
            telefono_cliente: contratto.cliente.telefono || 'Non disponibile',
            monte_canoni: formatEur(Number(contratto.monte_canoni)),
            tipo_device,
            numero_device,
            durata_desiderata,
            budget_mensile: budget_mensile ? formatEur(budget_mensile) : null,
            note: note || null,
            valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
            motivo_assegnazione: motivoAssegnazione,
          });

          const oggettoAgente = `Nuova richiesta rinnovo: ${contratto.cliente.ragione_sociale} — ${contratto.contratto_nsm_id}`;
          const sendAgente = await emailProvider.send(agente.email, oggettoAgente, htmlAgente);

          await prisma.comunicazione.create({
            data: {
              contratto_eol_id: contratto.id,
              tipo: 'NOTIFICA_AGENTE_RINNOVO',
              canale: 'EMAIL',
              destinatario: agente.email,
              oggetto: oggettoAgente,
              corpo_html: htmlAgente,
              data_invio: new Date(),
              esito_invio: sendAgente.success ? 'INVIATO' : 'ERRORE',
            },
          });
        }
      }

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'DECISIONE_PRESA', {
        opzione: 'RINNOVO', decisione_id: decisione.id, prequalificazione,
      });

      res.json({
        success: true,
        messaggio: 'Richiesta di rinnovo confermata',
        decisione_id: decisione.id,
        pdf_hash: hash,
        valore_gift_card: Number(contratto.valore_gift_card),
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/rinnovo/conferma] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// ===== RINNOVO COMPLETO (compound: scelta beni + rinnovo) =====

const iniziaRinnovoCompletoSchema = z.object({
  scelta_beni: z.enum(['TENGO', 'RESTITUISCO']),
  tipo_device: z.enum(['Apple MacBook', 'Apple iPad', 'PC Windows', 'Smartphone', 'Altro']),
  numero_device: z.number().int().min(1).default(1),
  durata_desiderata: z.enum(['24', '36', '48']).transform(Number),
  budget_mensile: z.number().optional(),
  note: z.string().optional(),
  metodo_otp: z.enum(['SMS', 'EMAIL']),
});

router.post(
  '/decisione/rinnovo-completo/inizia',
  otpLimiter,
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = iniziaRinnovoCompletoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const statiValidi = ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'LISTA_RICEVUTA'];
      if (!statiValidi.includes(contratto.stato)) {
        res.status(400).json({ errore: `Stato pratica non valido: ${contratto.stato}` });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { metodo_otp } = parsed.data;
      const destinatario = metodo_otp === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      await generateOtp(metodo_otp, destinatario);

      if (contratto.stato !== 'IN_ATTESA_DECISIONE') {
        await prisma.contratto_EOL.update({
          where: { id: contratto.id },
          data: { stato: 'IN_ATTESA_DECISIONE' },
        });
      }

      res.json({
        success: true,
        messaggio: `Codice OTP inviato via ${metodo_otp}`,
        destinatario_mascherato: destinatario.replace(/(.{3}).*(@.*)/, '$1***$2'),
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/rinnovo-completo/inizia] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

const confermaRinnovoCompletoSchema = z.object({
  codice: z.string().length(6),
  metodo_otp: z.enum(['SMS', 'EMAIL']),
  scelta_beni: z.enum(['TENGO', 'RESTITUISCO']),
  tipo_device: z.enum(['Apple MacBook', 'Apple iPad', 'PC Windows', 'Smartphone', 'Altro']),
  numero_device: z.number().int().min(1).default(1),
  durata_desiderata: z.number().int(),
  budget_mensile: z.number().optional(),
  note: z.string().optional(),
});

router.post(
  '/decisione/rinnovo-completo/conferma',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = confermaRinnovoCompletoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true, agente_originario: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { codice, metodo_otp, scelta_beni, tipo_device, numero_device, durata_desiderata, budget_mensile, note } = parsed.data;
      const destinatario = metodo_otp === 'EMAIL'
        ? contratto.cliente.email
        : (contratto.cliente.telefono || contratto.cliente.email);

      const otpResult = await verifyOtp(metodo_otp, destinatario, codice);
      if (!otpResult.valid) {
        res.status(400).json({ errore: otpResult.errore });
        return;
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'OTP_VERIFICATO', {
        metodo: metodo_otp, opzione: 'RINNOVO_COMPLETO', scelta_beni,
      });

      const prequalificazione: PrequalificazioneRinnovo = {
        tipo_device,
        numero_device,
        durata_desiderata,
        budget_mensile,
        note,
      };

      // Crea DUE decisioni in una transazione: una per i beni, una per il rinnovo
      const opzioneBeni = scelta_beni === 'TENGO' ? 'RINNOVO_RIACQUISTO_BENI' : 'RINNOVO_RESTITUZIONE_BENI';

      const [decisioneBeni, decisioneRinnovo] = await prisma.$transaction([
        prisma.decisione_Cliente.create({
          data: {
            contratto_eol_id: contratto.id,
            opzione_scelta: opzioneBeni,
            otp_verificato: true,
            otp_metodo: metodo_otp,
            ip_address: ip,
            user_agent: userAgent,
            note_cliente: scelta_beni === 'TENGO'
              ? JSON.stringify({ prezzo_riacquisto: Number(contratto.pricing_riacquisto) })
              : null,
          },
        }),
        prisma.decisione_Cliente.create({
          data: {
            contratto_eol_id: contratto.id,
            opzione_scelta: 'RINNOVO',
            otp_verificato: true,
            otp_metodo: metodo_otp,
            ip_address: ip,
            user_agent: userAgent,
            note_cliente: JSON.stringify(prequalificazione),
          },
        }),
      ]);

      // Assegna agente
      const { agenteAssegnatoId, motivoAssegnazione } = await assegnaPratica(contratto.id);

      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: {
          stato: 'DECISIONE_RINNOVO',
          agente_assegnato_id: agenteAssegnatoId,
        },
      });

      // Genera PDF conferma rinnovo
      const { hash, buffer: pdfBuffer } = await generaConfermaRinnovo(
        contratto.id,
        decisioneRinnovo.id,
        prequalificazione,
        { nome: contratto.cliente.ragione_sociale, ip, userAgent, otpVerificato: true },
      );

      // Invia email al cliente con PDF allegato
      let beni: Array<{ descrizione?: string }> = [];
      try { beni = JSON.parse(contratto.beni_json); } catch {}

      const htmlCliente = confermaRinnovoTemplate({
        ragione_sociale: contratto.cliente.ragione_sociale,
        numero_contratto_nsm: contratto.contratto_nsm_id,
        numero_contratto_grenke: contratto.contratto_grenke_id,
        tipo_device,
        numero_device,
        durata_desiderata,
        budget_mensile: budget_mensile ? formatEur(budget_mensile) : null,
        note: note || null,
        valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
        scelta_beni: scelta_beni === 'TENGO' ? 'Acquisto beni attuali' : 'Restituzione beni attuali',
        prezzo_riacquisto: scelta_beni === 'TENGO' ? formatEur(Number(contratto.pricing_riacquisto)) : null,
      });

      const oggettoCliente = `Conferma richiesta rinnovo — Contratto ${contratto.contratto_nsm_id}`;

      const sendCliente = await emailProvider.sendWithAttachment(
        contratto.cliente.email,
        oggettoCliente,
        htmlCliente,
        [{ filename: `conferma_rinnovo_${contratto.contratto_nsm_id}.pdf`, content: pdfBuffer }],
      );

      await prisma.comunicazione.create({
        data: {
          contratto_eol_id: contratto.id,
          tipo: 'CONFERMA_RINNOVO',
          canale: 'EMAIL',
          destinatario: contratto.cliente.email,
          oggetto: oggettoCliente,
          corpo_html: htmlCliente,
          data_invio: new Date(),
          esito_invio: sendCliente.success ? 'INVIATO' : 'ERRORE',
        },
      });

      // Notifica agente assegnato
      if (agenteAssegnatoId) {
        const agente = await prisma.utente_NSM.findUnique({ where: { id: agenteAssegnatoId } });
        if (agente) {
          const htmlAgente = notificaAgenteRinnovoTemplate({
            ragione_sociale: contratto.cliente.ragione_sociale,
            contratto_nsm: contratto.contratto_nsm_id,
            email_cliente: contratto.cliente.email,
            telefono_cliente: contratto.cliente.telefono || 'Non disponibile',
            monte_canoni: formatEur(Number(contratto.monte_canoni)),
            tipo_device,
            numero_device,
            durata_desiderata,
            budget_mensile: budget_mensile ? formatEur(budget_mensile) : null,
            note: note || null,
            valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
            motivo_assegnazione: motivoAssegnazione,
            scelta_beni: scelta_beni === 'TENGO' ? 'Acquisto beni attuali' : 'Restituzione beni attuali',
            prezzo_riacquisto: scelta_beni === 'TENGO' ? formatEur(Number(contratto.pricing_riacquisto)) : null,
          });

          const oggettoAgente = `Nuova richiesta rinnovo: ${contratto.cliente.ragione_sociale} — ${contratto.contratto_nsm_id}`;
          const sendAgente = await emailProvider.send(agente.email, oggettoAgente, htmlAgente);

          await prisma.comunicazione.create({
            data: {
              contratto_eol_id: contratto.id,
              tipo: 'NOTIFICA_AGENTE_RINNOVO',
              canale: 'EMAIL',
              destinatario: agente.email,
              oggetto: oggettoAgente,
              corpo_html: htmlAgente,
              data_invio: new Date(),
              esito_invio: sendAgente.success ? 'INVIATO' : 'ERRORE',
            },
          });
        }
      }

      // Se il cliente tiene i beni: gestisci pagamento differito (come per riacquisto)
      let pagamento_info: { pagamento_differito?: boolean; data_pagamento?: string; pagamento_immediato?: boolean } = {};
      if (scelta_beni === 'TENGO') {
        const configService = await import('../services/config.service.js');
        const giorniPagamento = await configService.getNumero('timeline.pagamento_riacquisto', 7);
        const oggi = new Date();
        const scadenza = new Date(contratto.data_scadenza);
        const diffMs = scadenza.getTime() - oggi.getTime();
        const giorniAllaScadenza = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

        if (giorniAllaScadenza <= giorniPagamento) {
          pagamento_info = { pagamento_immediato: true };
        } else {
          const dataPagamento = new Date(scadenza.getTime() - giorniPagamento * 24 * 60 * 60 * 1000);
          pagamento_info = { pagamento_differito: true, data_pagamento: dataPagamento.toISOString() };
        }
      }

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'DECISIONE_PRESA', {
        opzione: 'RINNOVO_COMPLETO',
        scelta_beni,
        decisione_beni_id: decisioneBeni.id,
        decisione_rinnovo_id: decisioneRinnovo.id,
        prequalificazione,
      });

      res.json({
        success: true,
        messaggio: 'Richiesta di rinnovo confermata',
        decisione_rinnovo_id: decisioneRinnovo.id,
        decisione_beni_id: decisioneBeni.id,
        scelta_beni,
        pdf_hash: hash,
        valore_gift_card: Number(contratto.valore_gift_card),
        ...pagamento_info,
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/rinnovo-completo/conferma] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// ===== CONTATTO PERSONALIZZATO ROUTE =====

const decisioneContattoSchema = z.object({
  fascia_oraria: z.enum(['MATTINA', 'POMERIGGIO', 'INDIFFERENTE']),
  modalita_preferita: z.enum(['TELEFONO', 'EMAIL', 'VIDEOCALL']),
  note: z.string().optional(),
});

router.post(
  '/decisione/contatto',
  verifyClienteToken,
  async (req: ClienteAuthenticatedRequest, res: Response) => {
    try {
      const parsed = decisioneContattoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ errore: 'Dati non validi', dettagli: parsed.error.flatten() });
        return;
      }

      const contratto = await prisma.contratto_EOL.findUnique({
        where: { id: req.contrattoEolId },
        include: { cliente: true, agente_originario: true },
      });

      if (!contratto) {
        res.status(404).json({ errore: 'Contratto non trovato' });
        return;
      }

      const statiValidi = ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'LISTA_RICEVUTA'];
      if (!statiValidi.includes(contratto.stato)) {
        res.status(400).json({ errore: `Stato pratica non valido: ${contratto.stato}` });
        return;
      }

      const decisioneEsistente = await prisma.decisione_Cliente.findFirst({
        where: { contratto_eol_id: contratto.id },
      });
      if (decisioneEsistente) {
        res.status(409).json({ errore: 'Decisione già registrata per questa pratica' });
        return;
      }

      const { fascia_oraria, modalita_preferita, note } = parsed.data;
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Crea Decisione_Cliente
      const decisione = await prisma.decisione_Cliente.create({
        data: {
          contratto_eol_id: contratto.id,
          opzione_scelta: 'CONTATTO',
          otp_verificato: false,
          ip_address: ip,
          user_agent: userAgent,
          note_cliente: note || null,
        },
      });

      // Assegna agente
      const { agenteAssegnatoId, motivoAssegnazione } = await assegnaPratica(contratto.id);

      // Crea Richiesta_Contatto
      await prisma.richiesta_Contatto.create({
        data: {
          contratto_eol_id: contratto.id,
          origine: 'OPZIONE_CONTATTO_PERSONALIZZATO',
          nome_referente: contratto.cliente.referente_nome || contratto.cliente.ragione_sociale,
          telefono: contratto.cliente.telefono || '',
          fascia_oraria,
          modalita_preferita,
          note: note || null,
          agente_assegnato_id: agenteAssegnatoId,
          stato: 'DA_GESTIRE',
        },
      });

      // Aggiorna stato pratica
      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: {
          stato: 'DECISIONE_CONTATTO',
          agente_assegnato_id: agenteAssegnatoId,
        },
      });

      // Notifica agente assegnato
      if (agenteAssegnatoId) {
        const agente = await prisma.utente_NSM.findUnique({ where: { id: agenteAssegnatoId } });
        if (agente) {
          const htmlAgente = notificaAgenteContattoTemplate({
            ragione_sociale: contratto.cliente.ragione_sociale,
            contratto_nsm: contratto.contratto_nsm_id,
            email_cliente: contratto.cliente.email,
            telefono_cliente: contratto.cliente.telefono || 'Non disponibile',
            monte_canoni: formatEur(Number(contratto.monte_canoni)),
            fascia_oraria,
            modalita_preferita,
            note: note || null,
            motivo_assegnazione: motivoAssegnazione,
          });

          const oggettoAgente = `Richiesta contatto personalizzato: ${contratto.cliente.ragione_sociale} — ${contratto.contratto_nsm_id}`;
          const sendAgente = await emailProvider.send(agente.email, oggettoAgente, htmlAgente);

          await prisma.comunicazione.create({
            data: {
              contratto_eol_id: contratto.id,
              tipo: 'NOTIFICA_AGENTE_CONTATTO',
              canale: 'EMAIL',
              destinatario: agente.email,
              oggetto: oggettoAgente,
              corpo_html: htmlAgente,
              data_invio: new Date(),
              esito_invio: sendAgente.success ? 'INVIATO' : 'ERRORE',
            },
          });
        }
      }

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'DECISIONE_PRESA', {
        opzione: 'CONTATTO', decisione_id: decisione.id, fascia_oraria, modalita_preferita,
      });

      await registraEvento(contratto.id, 'CLIENTE', contratto.cliente_id, 'RICHIESTA_CONTATTO_CREATA', {
        origine: 'OPZIONE_CONTATTO_PERSONALIZZATO',
      });

      res.json({
        success: true,
        messaggio: 'Richiesta di contatto personalizzato registrata. Ti contatteremo a breve.',
        decisione_id: decisione.id,
      });
    } catch (err) {
      console.error('[POST /api/cliente/decisione/contatto] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

// GET /api/cliente/config-testi — testi dinamici per area cliente
router.get('/config-testi', verifyClienteToken, async (_req: ClienteAuthenticatedRequest, res: Response) => {
  try {
    const { getCategoria } = await import('../services/impostazioni.service.js');
    const areaCliente = await getCategoria('AREA_CLIENTE');
    const flags = await getCategoria('FEATURE_FLAGS');

    const testi: Record<string, string> = {};
    for (const imp of areaCliente) {
      testi[imp.chiave] = imp.valore;
    }

    const featureFlags: Record<string, boolean> = {};
    for (const imp of flags) {
      featureFlags[imp.chiave] = imp.valore === 'true';
    }

    res.json({ testi, featureFlags });
  } catch (err) {
    console.error('[GET /api/cliente/config-testi] Errore:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// GET /api/cliente/configurazione — config pubblica per area cliente (titoli, descrizioni, flags)
router.get('/configurazione', verifyClienteToken, async (_req: ClienteAuthenticatedRequest, res: Response) => {
  try {
    const configService = await import('../services/config.service.js');

    res.json({
      abilita_gift_card: await configService.getBooleano('flags.abilita_gift_card', true),
      titolo_opzione_rinnovo: await configService.getTesto('cliente.titolo_opzione_rinnovo', 'Rinnova il contratto'),
      desc_opzione_rinnovo: await configService.getTesto('cliente.desc_opzione_rinnovo', 'Prosegui con un nuovo contratto FLEX alle stesse condizioni e ricevi un premio fedeltà.'),
      titolo_opzione_riacquisto: await configService.getTesto('cliente.titolo_opzione_riacquisto', 'Prenota l\'acquisto del bene'),
      desc_opzione_riacquisto: await configService.getTesto('cliente.desc_opzione_riacquisto', 'Prenota l\'acquisto dei beni in locazione al prezzo di acquisto indicato. NON paghi ora! Il pagamento ti sarà richiesto 7 giorni prima della scadenza del contratto.'),
      titolo_opzione_contatto: await configService.getTesto('cliente.titolo_opzione_contatto', 'Contatto personalizzato'),
      desc_opzione_contatto: await configService.getTesto('cliente.desc_opzione_contatto', 'Hai dubbi o esigenze particolari? Un nostro consulente ti ricontatterà.'),
      titolo_opzione_restituzione: await configService.getTesto('cliente.titolo_opzione_restituzione', 'Restituisci i beni'),
      desc_opzione_restituzione: await configService.getTesto('cliente.desc_opzione_restituzione', 'Concludi il contratto e restituisci i beni alla società di leasing.'),
      testo_widget_chiamami: await configService.getTesto('cliente.testo_widget_chiamami', 'Hai bisogno di parlare con noi prima di decidere?'),
      testo_avviso_proroga: await configService.getTesto('cliente.testo_avviso_proroga', 'In assenza di scelta entro la deadline, il contratto proseguirà in proroga con canoni invariati per 6 mesi.'),
    });
  } catch (err) {
    console.error('[GET /api/cliente/configurazione] Errore:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

export default router;
