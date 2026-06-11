import { Router, Response } from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
import { verifyBackofficeToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { parseAndReconcile, PreviewRow } from '../services/reconciliation.service.js';
import { previewNsmImport, confirmNsmImport } from '../services/nsm-import.service.js';
import { calcolaPricing, calcolaValoreGiftCard } from '../services/pricing.service.js';
import { inviaComunicazioneIniziale } from '../services/email.service.js';
import { createEmailProvider } from '../providers/notification/email.provider.js';
import { registraEvento } from '../services/audit.service.js';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(__dirname, '../../../templates/email');
const boEmailProvider = createEmailProvider();

const router = Router();
import { prisma } from '../lib/db.js';
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

// ─── IMPORT CONTRATTI NSM (export piattaforma di noleggio) ─────────
// Va eseguito PRIMA dell'import del file Grenke: crea/aggiorna la base
// dei contratti FLEX_ATTIVO con dispositivi, firmatario e canone reale.

// POST /api/backoffice/import-nsm/preview
router.post('/import-nsm/preview', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nessun file caricato' });
      return;
    }
    if (!req.file.originalname.endsWith('.xlsx')) {
      res.status(400).json({ error: 'Formato file non supportato. Caricare un file .xlsx' });
      return;
    }
    const preview = await previewNsmImport(req.file.buffer, prisma);
    res.json(preview);
  } catch (err) {
    console.error('[import-nsm/preview] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/import-nsm/confirm — ricarica il file e applica
router.post('/import-nsm/confirm', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Nessun file caricato' });
      return;
    }
    const result = await confirmNsmImport(req.file.buffer, prisma);

    await registraEvento(null, 'BACKOFFICE', req.user?.id || 'SCONOSCIUTO', 'IMPORT_CONTRATTI_NSM', {
      creati: result.creati,
      aggiornati: result.aggiornati,
      scartati: result.scartati,
      file: req.file.originalname,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[import-nsm/confirm] Errore:', err);
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
            scartati++;
            continue;
          }
        }

        const raw = row.raw;
        // Il tracciato Grenke porta solo denominazione, P.IVA, email e PEC:
        // gli altri dati anagrafici restano quelli della piattaforma NSM.
        const clienteData = {
          ragione_sociale: raw['cliente.ragione_sociale'],
          email: raw['cliente.email'],
          pec: raw['cliente.pec'] || null,
        };

        let clienteId: string;
        // Dati master dal contratto NSM matchato (file piattaforma di noleggio):
        // canone, mesi e beni del file Grenke si IGNORANO quando c'è il match.
        let matchedNsm: { canone_mensile: unknown; numero_mesi: number; beni_json: string; data_stipula: Date; origine: string } | null = null;

        if (row.status === 'RICONCILIATO_AUTO' && row.matchedContractId) {
          const existingContract = await tx.contratto_EOL.findUnique({
            where: { id: row.matchedContractId },
            select: { cliente_id: true, canone_mensile: true, numero_mesi: true, beni_json: true, data_stipula: true, origine: true },
          });
          if (!existingContract) {
            throw new Error(`Contratto matchato ${row.matchedContractId} non trovato`);
          }
          clienteId = existingContract.cliente_id;
          matchedNsm = existingContract;

          // I dati anagrafici NON vengono sovrascritti dal file Grenke:
          // la fonte master è l'export della piattaforma NSM.
          // Aggiorniamo però la scadenza ufficiale sul contratto base.
          await tx.contratto_EOL.update({
            where: { id: row.matchedContractId },
            data: { data_scadenza: new Date(raw.data_scadenza) },
          });
        } else if (row.status === 'OUTLIER_DA_GESTIRE') {
          const decision = decisionMap.get(row.index)!;
          if (decision.action === 'ASSOCIA' && decision.clienteId) {
            clienteId = decision.clienteId;
            await tx.cliente.update({ where: { id: clienteId }, data: clienteData });
          } else {
            // CREA nuovo cliente (o aggiorna se piva già esiste)
            const newCliente = await tx.cliente.upsert({
              where: { piva: raw['cliente.piva'] },
              update: clienteData,
              create: { piva: raw['cliente.piva'], ...clienteData },
            });
            clienteId = newCliente.id;
          }
        } else {
          continue;
        }

        // Canone/mesi/beni vengono SEMPRE dalla piattaforma NSM: il tracciato
        // Grenke non li contiene. Per gli outlier (contratto assente in
        // piattaforma) restano a zero finché non si importa l'export NSM.
        const canoneMaster = matchedNsm ? Number(matchedNsm.canone_mensile) : 0;
        const mesiMaster = matchedNsm ? matchedNsm.numero_mesi : 0;
        const beniMaster = matchedNsm ? matchedNsm.beni_json : '[]';

        const pricing = await calcolaPricing(canoneMaster, mesiMaster, raw.pricing_grenke);
        const valore_gift_card = await calcolaValoreGiftCard(pricing.margine_lordo);

        const nsmId = row.matchedContractNsmId || `NSM-EOL-${Date.now()}-${row.index}`;

        const contratto = await tx.contratto_EOL.create({
          data: {
            contratto_nsm_id: nsmId + (row.status === 'RICONCILIATO_AUTO' ? `-EOL` : ''),
            contratto_grenke_id: raw.contratto_grenke_id,
            cliente_id: clienteId,
            data_stipula: matchedNsm ? matchedNsm.data_stipula : raw.data_stipula ? new Date(raw.data_stipula) : new Date(),
            data_scadenza: new Date(raw.data_scadenza),
            canone_mensile: canoneMaster,
            numero_mesi: mesiMaster,
            monte_canoni: pricing.monte_canoni,
            valore_originario: null,
            beni_json: beniMaster,
            pricing_riacquisto: pricing.pricing_riacquisto,
            pricing_grenke: pricing.pricing_grenke,
            margine_lordo: pricing.margine_lordo,
            valore_gift_card,
            stato: 'LISTA_RICEVUTA',
            origine: matchedNsm?.origine || 'Smartcom',
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
      }

      return { creati, scartati, errori, contrattiCreati };
    }, { timeout: 120000, maxWait: 15000 }); // import lungo: molte query per riga verso Supabase

    for (const cId of result.contrattiCreati) {
      await registraEvento(cId, 'BACKOFFICE', (req.user as any)?.id || 'system', 'PRATICA_CREATA', {
        origine: 'IMPORTAZIONE_EXCEL',
      });
    }

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

    await registraEvento(id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MODIFICA_BACKOFFICE', {
      sotto_azione: 'SBLOCCA_PAGAMENTO',
      stato_precedente: 'RIACQUISTO_IN_ATTESA_CHIAMATA',
      stato_nuovo: 'IN_ATTESA_DECISIONE',
    });

    res.json({ success: true, messaggio: 'Pagamento sbloccato e cliente notificato' });
  } catch (err) {
    console.error('[sblocca-pagamento] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// GET /api/backoffice/miei-task — task assegnati all'utente loggato (sessione passport)
router.get('/miei-task', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Supporta sia sessione passport che header x-user-id
    const userId = (req.user as any)?.id || req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Autenticazione richiesta' });
      return;
    }

    const { tipo, stato } = req.query as { tipo?: string; stato?: string };

    // Decisioni RINNOVO/CONTATTO assegnate a me
    const whereContratto: any = { agente_assegnato_id: userId };
    if (tipo === 'RINNOVO') {
      whereContratto.stato = 'DECISIONE_RINNOVO';
    } else if (tipo === 'CONTATTO') {
      whereContratto.stato = 'DECISIONE_CONTATTO';
    } else if (tipo === 'RIACQUISTO') {
      whereContratto.stato = 'DECISIONE_RIACQUISTO_IN_CORSO';
    } else {
      whereContratto.stato = { in: ['DECISIONE_RINNOVO', 'DECISIONE_CONTATTO', 'DECISIONE_RIACQUISTO_IN_CORSO'] };
    }

    const contratti = await prisma.contratto_EOL.findMany({
      where: whereContratto,
      include: {
        cliente: { select: { ragione_sociale: true, piva: true, email: true, telefono: true } },
        decisioni: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        richieste_contatto: {
          where: { agente_assegnato_id: userId },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    const tasks = contratti.map(c => {
      const decisione = c.decisioni[0];
      const richiesta = c.richieste_contatto[0];
      return {
        contratto_id: c.id,
        contratto_nsm: c.contratto_nsm_id,
        contratto_grenke: c.contratto_grenke_id,
        cliente: c.cliente,
        tipo: decisione?.opzione_scelta || 'CONTATTO',
        stato_pratica: c.stato,
        data_creazione: decisione?.created_at || c.updated_at,
        note_cliente: decisione?.note_cliente || richiesta?.note || null,
        prequalificazione: decisione?.opzione_scelta === 'RINNOVO' && decisione?.note_cliente
          ? JSON.parse(decisione.note_cliente)
          : null,
        richiesta_contatto: richiesta ? {
          fascia_oraria: richiesta.fascia_oraria,
          modalita_preferita: richiesta.modalita_preferita,
          stato: richiesta.stato,
        } : null,
      };
    });

    res.json(tasks);
  } catch (err) {
    console.error('[miei-task] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// GET /api/backoffice/task-escalation — task escalation assegnati all'utente
router.get('/task-escalation', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.id || req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Autenticazione richiesta' });
      return;
    }

    const userRecord = await prisma.utente_NSM.findUnique({ where: { id: userId } });
    const isAdmin = userRecord && (userRecord.ruolo === 'ADMIN' || userRecord.ruolo === 'BACKOFFICE_INTERNO');

    const where: any = { stato: { in: ['DA_CHIAMARE', 'RICHIAMARE'] } };
    if (!isAdmin) {
      where.assegnato_a_id = userId;
    }

    const tasks = await prisma.task_Escalation.findMany({
      where,
      include: {
        contratto_eol: {
          include: {
            cliente: { select: { ragione_sociale: true, piva: true, email: true, telefono: true, referente_nome: true, referente_telefono: true } },
            comunicazioni: { orderBy: { data_invio: 'desc' }, take: 10 },
          },
        },
        assegnato_a: { select: { nome: true, cognome: true, email: true } },
      },
      orderBy: [
        { tipo: 'desc' },
        { data_creazione: 'desc' },
      ],
    });

    const result = tasks.map(t => ({
      id: t.id,
      tipo: t.tipo,
      stato: t.stato,
      data_creazione: t.data_creazione,
      data_completamento: t.data_completamento,
      esito: t.esito,
      note: t.note,
      assegnato_a: t.assegnato_a,
      contratto: {
        id: t.contratto_eol.id,
        contratto_nsm_id: t.contratto_eol.contratto_nsm_id,
        contratto_grenke_id: t.contratto_eol.contratto_grenke_id,
        data_scadenza: t.contratto_eol.data_scadenza,
        monte_canoni: t.contratto_eol.monte_canoni,
        beni_json: t.contratto_eol.beni_json,
        stato: t.contratto_eol.stato,
      },
      cliente: t.contratto_eol.cliente,
      storico_comunicazioni: t.contratto_eol.comunicazioni.map(c => ({
        tipo: c.tipo,
        data: c.data_invio,
        esito: c.esito_invio,
        canale: c.canale,
      })),
    }));

    res.json(result);
  } catch (err) {
    console.error('[task-escalation] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/task-escalation/:id/esito — registra esito chiamata
router.post('/task-escalation/:id/esito', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req.user as any)?.id || req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'Autenticazione richiesta' });
      return;
    }

    const taskId = req.params.id as string;
    const { esito, note, decisione_cliente } = req.body as {
      esito: 'RISPOSTA_POSITIVA' | 'RISPOSTA_NEGATIVA' | 'NON_RAGGIUNTO' | 'RICHIAMARE';
      note?: string;
      decisione_cliente?: 'RINNOVO' | 'RIACQUISTO' | 'CONTATTO' | 'RESTITUZIONE';
    };

    if (!esito || !['RISPOSTA_POSITIVA', 'RISPOSTA_NEGATIVA', 'NON_RAGGIUNTO', 'RICHIAMARE'].includes(esito)) {
      res.status(400).json({ error: 'Esito non valido' });
      return;
    }

    if (esito === 'RISPOSTA_POSITIVA' && !decisione_cliente) {
      res.status(400).json({ error: 'Decisione cliente obbligatoria per esito positivo' });
      return;
    }

    const task = await prisma.task_Escalation.findUnique({
      where: { id: taskId },
      include: { contratto_eol: { include: { cliente: true } } },
    });

    if (!task) {
      res.status(404).json({ error: 'Task non trovato' });
      return;
    }

    const nuovoStato = esito === 'RICHIAMARE' ? 'RICHIAMARE' :
                        esito === 'NON_RAGGIUNTO' ? 'NON_RAGGIUNTO' : 'CHIAMATO';

    await prisma.task_Escalation.update({
      where: { id: taskId },
      data: {
        stato: nuovoStato,
        esito,
        note: note || null,
        data_completamento: esito !== 'RICHIAMARE' ? new Date() : null,
      },
    });

    const tipoCom = `ESCALATION_TELEFONICA_${task.tipo}`;
    await prisma.comunicazione.create({
      data: {
        contratto_eol_id: task.contratto_eol_id,
        tipo: tipoCom,
        canale: 'TELEFONO',
        destinatario: task.contratto_eol.cliente.telefono || task.contratto_eol.cliente.email,
        oggetto: `Chiamata escalation ${task.tipo}`,
        esito_chiamata: esito,
        data_invio: new Date(),
        esito_invio: 'COMPLETATO',
        operatore_id: userId,
      },
    });

    if (esito === 'RISPOSTA_POSITIVA' && decisione_cliente) {
      const statoMap: Record<string, string> = {
        RINNOVO: 'DECISIONE_RINNOVO',
        RIACQUISTO: 'DECISIONE_RIACQUISTO',
        CONTATTO: 'DECISIONE_CONTATTO',
        RESTITUZIONE: 'DECISIONE_RESTITUZIONE',
      };

      await prisma.decisione_Cliente.create({
        data: {
          contratto_eol_id: task.contratto_eol_id,
          opzione_scelta: decisione_cliente,
          otp_verificato: false,
          otp_metodo: 'TELEFONICA',
          note_cliente: note ? `[Via telefono] ${note}` : '[Decisione registrata via telefono]',
        },
      });

      await prisma.contratto_EOL.update({
        where: { id: task.contratto_eol_id },
        data: { stato: statoMap[decisione_cliente] || 'IN_ATTESA_DECISIONE' },
      });
    }

    await registraEvento(task.contratto_eol_id, 'BACKOFFICE', userId, 'TASK_ESCALATION_COMPLETATO', {
      task_id: taskId,
      tipo: task.tipo,
      esito,
      decisione_cliente: decisione_cliente || null,
    });

    res.json({
      success: true,
      messaggio: `Esito ${esito} registrato per task ${task.tipo}`,
      task_stato: nuovoStato,
    });
  } catch (err) {
    console.error('[task-escalation/esito] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

export default router;
