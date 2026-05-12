import { Router, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  verifyClienteToken,
  ClienteAuthenticatedRequest,
} from '../middleware/cliente.middleware.js';
import { SmtpEmailProvider } from '../providers/notification/email.provider.js';
import { generateOtp, verifyOtp } from '../services/otp.service.js';
import { generaVerbaleRestituzione } from '../services/pdf.service.js';
import { MockFeaProvider } from '../providers/signature/fea.provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();
const prisma = new PrismaClient();
const emailProvider = new SmtpEmailProvider();

const configDir = resolve(__dirname, '../../../config');
const templateDir = resolve(__dirname, '../../../templates/email');
const pricingRules = JSON.parse(readFileSync(resolve(configDir, 'pricing_rules.json'), 'utf-8'));
const assignmentRules = JSON.parse(
  readFileSync(resolve(configDir, 'assignment_rules.json'), 'utf-8'),
);

const notificaTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'notifica_richiesta_contatto.html'), 'utf-8'),
);
const confermaRestituzioneTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'conferma_restituzione.html'), 'utf-8'),
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

// I4 fix: IVA calculation using integer cents to avoid floating point errors
function calcolaIva(importo: Prisma.Decimal, ivaPerc: number): { iva: number; totale: number } {
  const centesimi = Math.round(Number(importo) * 100);
  const ivaCentesimi = Math.round(centesimi * ivaPerc);
  return {
    iva: ivaCentesimi / 100,
    totale: (centesimi + ivaCentesimi) / 100,
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

    const ivaPerc = pricingRules.iva_percentuale as number;
    const { iva, totale } = calcolaIva(contratto.pricing_riacquisto, ivaPerc);

    const dataScadenza = new Date(contratto.data_scadenza);
    const deadlineDecisione = calcolaDeadline(dataScadenza);

    let beni: Array<{ descrizione?: string }> = [];
    try {
      beni = JSON.parse(contratto.beni_json);
    } catch {}

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

      // Assignment rules (SPECS 5.3)
      let agenteAssegnatoId: string | null = null;
      let motivoAssegnazione = '';

      const soglia = assignmentRules.soglia_alto_valore_eur as number;

      if (contratto.agente_originario && contratto.agente_originario.attivo) {
        agenteAssegnatoId = contratto.agente_originario.id;
        motivoAssegnazione = 'agente_originario';
      }

      // I7: capo_area = primo ADMIN attivo (workaround: manca relazione gerarchica nello schema)
      if (!agenteAssegnatoId && Number(contratto.monte_canoni) >= soglia) {
        const capoArea = await prisma.utente_NSM.findFirst({
          where: { ruolo: 'ADMIN', attivo: true },
        });
        if (capoArea) {
          agenteAssegnatoId = capoArea.id;
          motivoAssegnazione = 'capo_area';
        }
      }

      if (!agenteAssegnatoId) {
        const teamBackoffice = await prisma.utente_NSM.findFirst({
          where: { ruolo: 'BACKOFFICE_INTERNO', attivo: true },
        });
        if (teamBackoffice) {
          agenteAssegnatoId = teamBackoffice.id;
          motivoAssegnazione = 'backoffice_interno';
        }
      }

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

      const { pdfPath, hash } = await generaVerbaleRestituzione(contratto.id, decisione.id, {
        nome: contratto.cliente.ragione_sociale,
        ip,
        userAgent,
        otpVerificato: true,
      });

      await feaProvider.requestSignature(pdfPath, {
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
      const { readFileSync } = await import('fs');
      const pdfBuffer = readFileSync(pdfPath);

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

      const { readFileSync } = await import('fs');
      const pdf = readFileSync(decisione.pdf_conferma_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="verbale_restituzione.pdf"`);
      res.send(pdf);
    } catch (err) {
      console.error('[GET /api/cliente/decisione/pdf] Errore:', err);
      res.status(500).json({ errore: 'Errore interno' });
    }
  },
);

export default router;
