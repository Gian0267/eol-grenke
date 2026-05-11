import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { verifyBackofficeToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { parseAndReconcile, PreviewRow } from '../services/reconciliation.service.js';
import { calcolaPricing, calcolaValoreGiftCard } from '../services/pricing.service.js';
import { inviaComunicazioneIniziale } from '../services/email.service.js';

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
            token_accesso_cliente: crypto.randomBytes(32).toString('hex'),
          },
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

export default router;
