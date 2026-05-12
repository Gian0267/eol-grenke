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

// B1+B2 fix: Handlebars template (auto-escapes user input)
const notificaTemplate = Handlebars.compile(
  readFileSync(resolve(templateDir, 'notifica_richiesta_contatto.html'), 'utf-8'),
);

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

export default router;
