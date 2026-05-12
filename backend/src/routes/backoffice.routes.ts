import { Router, Response } from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
import { verifyBackofficeToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { parseAndReconcile, PreviewRow } from '../services/reconciliation.service.js';
import { calcolaPricing, calcolaValoreGiftCard } from '../services/pricing.service.js';
import { inviaComunicazioneIniziale } from '../services/email.service.js';
import { SmtpEmailProvider } from '../providers/notification/email.provider.js';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(__dirname, '../../../templates/email');
const boEmailProvider = new SmtpEmailProvider();

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(verifyBackofficeToken as any);

// POST /api/backoffice/import/preview
router.post('/import/preview', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nessun file caricato' });
      return;
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(req.file.mimetype) && !req.file.originalname.endsWith('.xlsx')) {
      res.status(400).json({ error: 'Formato file non supportato. Caricare un file .xlsx' });
      return;
    }

    const preview = await parseAndReconcile(req.file.buffer, prisma);
    res.json(preview);
  } catch (err) {
    console.error('[import/preview] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/import/confirm
interface OutlierDecision {
  index: number;
  action: 'ASSOCIA' | 'CREA' | 'SCARTA';
  clienteId?: string;
  motivazione?: string;
}

interface ConfirmBody {
  rows: PreviewRow[];
  outlierDecisions: OutlierDecision[];
}

router.post('/import/confirm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows, outlierDecisions } = req.body as ConfirmBody;

    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ error: 'Dati anteprima mancanti' });
      return;
    }

    const decisionMap = new Map<number, OutlierDecision>();
    if (outlierDecisions) {
      for (const d of outlierDecisions) {
        if (d.action === 'SCARTA' && !d.motivazione) {
          res.status(400).json({ error: `Motivazione obbligatoria per scarto riga ${d.index}` });
          return;
        }
        if (d.action === 'CREA' && !d.motivazione) {
          res.status(400).json({ error: `Motivazione obbligatoria per creazione riga ${d.index}` });
          return;
        }
        decisionMap.set(d.index, d);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let creati = 0;
      let scartati = 0;
      let errori = 0;
      const contrattiCreati: string[] = [];

      for (const row of rows) {
        if (row.status === 'ERRORE') {
          errori++;
          continue;
        }

        if (row.status === 'OUTLIER_DA_GESTIRE') {
          const decision = decisionMap.get(row.index);
          if (!decision) {
            throw new Error(`Decisione mancante per outlier riga ${row.index}`);
          }
          if (decision.action === 'SCARTA') {
            console.log(`[AUDIT] Riga ${row.index} scartata: ${decision.motivazione}`);
            scartati++;
            continue;
          }
        }

        const raw = row.raw;
        const clienteData = {
          ragione_sociale: raw['cliente.ragione_sociale'],
          email: raw['cliente.email'],
          pec: raw['cliente.pec'] || null,
          codice_fiscale: raw['cliente.codice_fiscale'] || null,
          telefono: raw['cliente.telefono'] || null,
          indirizzo_sede: raw['cliente.indirizzo_sede'] || null,
          cap: raw['cliente.cap'] || null,
          citta: raw['cliente.citta'] || null,
          provincia: raw['cliente.provincia'] || null,
        };

        let clienteId: string;

        if (row.status === 'RICONCILIATO_AUTO' && row.matchedContractId) {
          const existingContract = await tx.contratto_EOL.findUnique({
            where: { id: row.matchedContractId },
            select: { cliente_id: true },
          });
          if (!existingContract) {
            throw new Error(`Contratto matchato ${row.matchedContractId} non trovato`);
          }
          clienteId = existingContract.cliente_id;

          await tx.cliente.update({
            where: { id: clienteId },
            data: clienteData,
          });
        } else if (row.status === 'OUTLIER_DA_GESTIRE') {
          const decision = decisionMap.get(row.index)!;
          if (decision.action === 'ASSOCIA' && decision.clienteId) {
            clienteId = decision.clienteId;
            await tx.cliente.update({ where: { id: clienteId }, data: clienteData });
          } else {
            // CREA nuovo cliente
            const newCliente = await tx.cliente.create({
              data: { piva: raw['cliente.piva'], ...clienteData },
            });
            clienteId = newCliente.id;
            console.log(`[AUDIT] Nuovo cliente creato per outlier riga ${row.index}: ${newCliente.id} - ${decision?.motivazione}`);
          }
        } else {
          continue;
        }

        const pricing = calcolaPricing(raw.canone_mensile, raw.numero_mesi);
        const valore_gift_card = calcolaValoreGiftCard(pricing.margine_lordo);

        const nsmId = row.matchedContractNsmId || `NSM-EOL-${Date.now()}-${row.index}`;

        const contratto = await tx.contratto_EOL.create({
          data: {
            contratto_nsm_id: nsmId + (row.status === 'RICONCILIATO_AUTO' ? `-EOL` : ''),
            contratto_grenke_id: raw.contratto_grenke_id,
            cliente_id: clienteId,
            data_stipula: raw.data_stipula ? new Date(raw.data_stipula) : new Date(),
            data_scadenza: new Date(raw.data_scadenza),
            canone_mensile: raw.canone_mensile,
            numero_mesi: raw.numero_mesi,
            monte_canoni: pricing.monte_canoni,
            valore_originario: raw.valore_originario ?? null,
            beni_json: JSON.stringify(raw.beni_descrizione ? [{ descrizione: raw.beni_descrizione }] : []),
            pricing_riacquisto: pricing.pricing_riacquisto,
            pricing_grenke: pricing.pricing_grenke,
            margine_lordo: pricing.margine_lordo,
            valore_gift_card,
            stato: 'LISTA_RICEVUTA',
            origine: raw.origine || 'Smartcom',
            data_importazione: new Date(),
            stato_riconciliazione: row.status === 'RICONCILIATO_AUTO' ? 'RICONCILIATO_AUTO' : 'OUTLIER_RISOLTO',
            token_accesso_cliente: null,
          },
        });

        const dataScadenza = new Date(raw.data_scadenza);
        const exp = Math.floor((dataScadenza.getTime() - JWT_EXPIRES_OFFSET_DAYS * 86400000) / 1000);
        const token = jwt.sign(
          { contratto_eol_id: contratto.id, cliente_id: clienteId, exp },
          JWT_SECRET,
        );
        await tx.contratto_EOL.update({
          where: { id: contratto.id },
          data: { token_accesso_cliente: token },
        });

        contrattiCreati.push(contratto.id);
        creati++;
        console.log(`[AUDIT] Contratto_EOL creato: ${contratto.id} (grenke: ${raw.contratto_grenke_id}, stato_ric: ${row.status})`);
      }

      return { creati, scartati, errori, contrattiCreati };
    });

    res.json({
      success: true,
      message: `Importazione completata: ${result.creati} contratti creati, ${result.scartati} scartati, ${result.errori} errori`,
      ...result,
    });
  } catch (err) {
    console.error('[import/confirm] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche — lista pratiche EOL
router.get('/pratiche', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pratiche = await prisma.contratto_EOL.findMany({
      include: { cliente: { select: { ragione_sociale: true, piva: true, email: true } } },
      orderBy: { data_importazione: 'desc' },
    });
    res.json(pratiche);
  } catch (err) {
    console.error('[pratiche] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche/:id/invia-comunicazione — invio singolo
router.post('/pratiche/:id/invia-comunicazione', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await inviaComunicazioneIniziale(req.params.id as string);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[invia-comunicazione] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche/invia-comunicazione-batch — invio a tutte le LISTA_RICEVUTA
router.post('/pratiche/invia-comunicazione-batch', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: 'LISTA_RICEVUTA' },
      select: { id: true },
    });

    let inviati = 0;
    let errori = 0;
    let saltati = 0;
    const dettagli: Array<{ contrattoId: string; esito: string; errori?: string[] }> = [];

    for (const p of pratiche) {
      const result = await inviaComunicazioneIniziale(p.id);
      if (result.success) {
        inviati++;
        dettagli.push({ contrattoId: p.id, esito: 'INVIATO' });
      } else if (result.errori.some(e => e.includes('opt-out') || e.includes('Stato non valido'))) {
        saltati++;
        dettagli.push({ contrattoId: p.id, esito: 'SALTATO', errori: result.errori });
      } else {
        errori++;
        dettagli.push({ contrattoId: p.id, esito: 'ERRORE', errori: result.errori });
      }
    }

    res.json({
      message: `Batch completato: ${inviati} inviati, ${saltati} saltati, ${errori} errori`,
      totale: pratiche.length,
      inviati,
      saltati,
      errori,
      dettagli,
    });
  } catch (err) {
    console.error('[invia-comunicazione-batch] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// GET /api/backoffice/riacquisti-in-attesa — pratiche in attesa chiamata
router.get('/riacquisti-in-attesa', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: 'RIACQUISTO_IN_ATTESA_CHIAMATA' },
      include: {
        cliente: { select: { ragione_sociale: true, piva: true, email: true, telefono: true } },
        richieste_contatto: {
          where: { origine: 'STEP_PRE_PAGAMENTO' },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { updated_at: 'desc' },
    });
    res.json(pratiche);
  } catch (err) {
    console.error('[riacquisti-in-attesa] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche/:id/sblocca-pagamento
router.post('/pratiche/:id/sblocca-pagamento', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const pratica = await prisma.contratto_EOL.findUnique({
      where: { id },
      include: { cliente: true },
    });

    if (!pratica) {
      res.status(404).json({ error: 'Pratica non trovata' });
      return;
    }

    if (pratica.stato !== 'RIACQUISTO_IN_ATTESA_CHIAMATA') {
      res.status(400).json({ error: `Stato non valido per sblocco: ${pratica.stato}` });
      return;
    }

    await prisma.contratto_EOL.update({
      where: { id: pratica.id },
      data: { stato: 'IN_ATTESA_DECISIONE' },
    });

    // Aggiorna la richiesta contatto come sbloccata
    const richiesta = await prisma.richiesta_Contatto.findFirst({
      where: {
        contratto_eol_id: pratica.id,
        origine: 'STEP_PRE_PAGAMENTO',
        pratica_sbloccata: false,
      },
      orderBy: { created_at: 'desc' },
    });
    if (richiesta) {
      await prisma.richiesta_Contatto.update({
        where: { id: richiesta.id },
        data: { pratica_sbloccata: true, stato: 'RICHIAMATO', data_richiamato: new Date() },
      });
    }

    // Invia email al cliente con link per riprendere
    if (pratica.token_accesso_cliente) {
      let sbloccoTemplate: HandlebarsTemplateDelegate;
      try {
        sbloccoTemplate = Handlebars.compile(
          readFileSync(resolve(templateDir, 'sblocco_pagamento.html'), 'utf-8'),
        );
      } catch {
        // Fallback semplice se template non ancora creato
        sbloccoTemplate = Handlebars.compile(
          '<p>Gentile {{ragione_sociale}}, il pagamento per il riacquisto del bene e\' ora sbloccato.</p>' +
          '<p><a href="{{link}}">Clicca qui per riprendere il pagamento</a></p>',
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const cliente = pratica.cliente!;
      const html = sbloccoTemplate({
        ragione_sociale: cliente.ragione_sociale,
        link: `${frontendUrl}/pratica/${pratica.token_accesso_cliente}/riacquisto`,
      });

      await boEmailProvider.send(
        cliente.email,
        `Pagamento sbloccato — Contratto ${pratica.contratto_nsm_id}`,
        html,
      );
    }

    res.json({ success: true, messaggio: 'Pagamento sbloccato e cliente notificato' });
  } catch (err) {
    console.error('[sblocca-pagamento] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

export default router;
