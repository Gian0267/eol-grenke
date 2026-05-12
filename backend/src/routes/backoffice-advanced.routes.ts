import { Router, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { verifyBackofficeToken } from '../middleware/auth.middleware.js';
import { inviaComunicazioneIniziale } from '../services/email.service.js';
import { registraEvento } from '../services/audit.service.js';

const router = Router();
const prisma = new PrismaClient();

router.use(verifyBackofficeToken as any);

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

// ─── LISTA PRATICHE AVANZATA ───────────────────────────────────────────────

// GET /api/backoffice/pratiche-avanzate
router.get('/pratiche-avanzate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = '1', pageSize = '20',
      sortBy = 'updated_at', sortOrder = 'desc',
      stato, agente_id, data_scadenza_from, data_scadenza_to,
      origine, decisione, rischio_silenzio,
    } = req.query as Record<string, string>;

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const where: any = { stato: { not: 'FLEX_ATTIVO' } };

    if (stato) where.stato = stato;
    if (agente_id) where.agente_assegnato_id = agente_id;
    if (origine) where.origine = origine;
    if (data_scadenza_from || data_scadenza_to) {
      where.data_scadenza = {};
      if (data_scadenza_from) where.data_scadenza.gte = new Date(data_scadenza_from);
      if (data_scadenza_to) where.data_scadenza.lte = new Date(data_scadenza_to);
    }

    const allowedSort = ['updated_at', 'data_scadenza', 'contratto_nsm_id', 'stato', 'created_at'];
    const orderField = allowedSort.includes(sortBy) ? sortBy : 'updated_at';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, pratiche] = await Promise.all([
      prisma.contratto_EOL.count({ where }),
      prisma.contratto_EOL.findMany({
        where,
        include: {
          cliente: { select: { ragione_sociale: true, piva: true, email: true } },
          agente_assegnato: { select: { nome: true, cognome: true } },
          decisioni: { orderBy: { created_at: 'desc' as const }, take: 1 },
        },
        orderBy: { [orderField]: orderDir },
        skip,
        take,
      }),
    ]);

    const now = new Date();
    let items = pratiche.map(p => {
      const giorni_a_scadenza = diffDays(p.data_scadenza, now);
      return {
        id: p.id,
        contratto_nsm: p.contratto_nsm_id,
        contratto_grenke: p.contratto_grenke_id,
        cliente: p.cliente.ragione_sociale,
        cliente_piva: p.cliente.piva,
        data_scadenza: p.data_scadenza,
        stato: p.stato,
        agente: p.agente_assegnato ? `${p.agente_assegnato.nome} ${p.agente_assegnato.cognome}` : null,
        pricing_riacquisto: Number(p.pricing_riacquisto),
        decisione: p.decisioni[0]?.opzione_scelta || null,
        giorni_a_scadenza,
        origine: p.origine,
      };
    });

    if (rischio_silenzio === 'true') {
      items = items.filter(p => p.stato === 'IN_ATTESA_DECISIONE' && p.giorni_a_scadenza >= 31 && p.giorni_a_scadenza <= 50);
    }

    if (decisione) {
      items = items.filter(p => p.decisione === decisione);
    }

    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[pratiche-avanzate] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche-avanzate/export-csv
router.get('/pratiche-avanzate/export-csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { stato, agente_id, data_scadenza_from, data_scadenza_to, origine } = req.query as Record<string, string>;

    const where: any = { stato: { not: 'FLEX_ATTIVO' } };
    if (stato) where.stato = stato;
    if (agente_id) where.agente_assegnato_id = agente_id;
    if (origine) where.origine = origine;
    if (data_scadenza_from || data_scadenza_to) {
      where.data_scadenza = {};
      if (data_scadenza_from) where.data_scadenza.gte = new Date(data_scadenza_from);
      if (data_scadenza_to) where.data_scadenza.lte = new Date(data_scadenza_to);
    }

    const pratiche = await prisma.contratto_EOL.findMany({
      where,
      include: {
        cliente: { select: { ragione_sociale: true, piva: true, email: true } },
        agente_assegnato: { select: { nome: true, cognome: true } },
        decisioni: { orderBy: { created_at: 'desc' as const }, take: 1 },
      },
      orderBy: { data_scadenza: 'asc' },
    });

    const header = 'Contratto NSM;Contratto Grenke;Cliente;P.IVA;Email;Scadenza;Stato;Agente;Pricing Riacquisto;Decisione\n';
    const rows = pratiche.map(p => {
      const agente = p.agente_assegnato ? `${p.agente_assegnato.nome} ${p.agente_assegnato.cognome}` : '';
      const dec = p.decisioni[0]?.opzione_scelta || '';
      const scad = p.data_scadenza.toISOString().split('T')[0];
      return `${p.contratto_nsm_id};${p.contratto_grenke_id};${p.cliente.ragione_sociale};${p.cliente.piva};${p.cliente.email};${scad};${p.stato};${agente};${Number(p.pricing_riacquisto).toFixed(2)};${dec}`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pratiche_eol.csv"');
    res.send('﻿' + header + rows);
  } catch (err) {
    console.error('[export-csv] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── DETTAGLIO PRATICA ─────────────────────────────────────────────────────

// GET /api/backoffice/pratiche-dettaglio/:id
router.get('/pratiche-dettaglio/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pratica = await prisma.contratto_EOL.findUnique({
      where: { id: req.params.id as string },
      include: {
        cliente: true,
        agente_assegnato: { select: { id: true, nome: true, cognome: true, email: true, ruolo: true } },
        agente_originario: { select: { id: true, nome: true, cognome: true } },
        decisioni: { orderBy: { created_at: 'desc' } },
        comunicazioni: { orderBy: { data_invio: 'desc' } },
        richieste_contatto: {
          orderBy: { created_at: 'desc' },
          include: { agente_assegnato: { select: { nome: true, cognome: true } } },
        },
        pagamenti: { orderBy: { data_iniziato: 'desc' } },
        task_escalation: {
          orderBy: { data_creazione: 'desc' },
          include: { assegnato_a: { select: { nome: true, cognome: true } } },
        },
      },
    });

    if (!pratica) {
      res.status(404).json({ error: 'Pratica non trovata' });
      return;
    }

    const now = new Date();
    const giorni_a_scadenza = diffDays(pratica.data_scadenza, now);

    const timeline: any[] = [];

    for (const c of pratica.comunicazioni) {
      timeline.push({
        tipo: 'COMUNICAZIONE',
        sottotipo: c.tipo,
        data: c.data_invio,
        dettaglio: c.oggetto || c.tipo,
        canale: c.canale,
        esito: c.esito_invio,
      });
    }

    for (const d of pratica.decisioni) {
      timeline.push({
        tipo: 'DECISIONE',
        sottotipo: d.opzione_scelta,
        data: d.created_at,
        dettaglio: `Decisione: ${d.opzione_scelta}${d.otp_verificato ? ' (OTP verificato)' : ''}`,
        note: d.note_cliente,
      });
    }

    for (const t of pratica.task_escalation) {
      timeline.push({
        tipo: 'ESCALATION',
        sottotipo: t.tipo,
        data: t.data_creazione,
        dettaglio: `Escalation ${t.tipo} — ${t.stato}`,
        esito: t.esito,
        assegnato: t.assegnato_a ? `${t.assegnato_a.nome} ${t.assegnato_a.cognome}` : null,
      });
    }

    for (const p of pratica.pagamenti) {
      timeline.push({
        tipo: 'PAGAMENTO',
        sottotipo: p.metodo,
        data: p.data_iniziato,
        dettaglio: `Pagamento ${p.metodo} — ${p.stato} (€${Number(p.importo_totale).toFixed(2)})`,
      });
    }

    timeline.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    res.json({
      ...pratica,
      canone_mensile: Number(pratica.canone_mensile),
      monte_canoni: Number(pratica.monte_canoni),
      pricing_riacquisto: Number(pratica.pricing_riacquisto),
      pricing_grenke: Number(pratica.pricing_grenke),
      margine_lordo: Number(pratica.margine_lordo),
      valore_gift_card: Number(pratica.valore_gift_card),
      valore_originario: pratica.valore_originario ? Number(pratica.valore_originario) : null,
      giorni_a_scadenza,
      timeline,
    });
  } catch (err) {
    console.error('[pratiche-dettaglio] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── AZIONI PRATICA ────────────────────────────────────────────────────────

// POST /api/backoffice/pratiche-dettaglio/:id/cambia-agente
router.post('/pratiche-dettaglio/:id/cambia-agente', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { agente_id } = req.body as { agente_id: string };
    if (!agente_id) {
      res.status(400).json({ error: 'agente_id obbligatorio' });
      return;
    }

    const agente = await prisma.utente_NSM.findUnique({ where: { id: agente_id } });
    if (!agente) {
      res.status(404).json({ error: 'Agente non trovato' });
      return;
    }

    await prisma.contratto_EOL.update({
      where: { id: req.params.id as string },
      data: { agente_assegnato_id: agente_id },
    });

    res.json({ success: true, messaggio: `Agente cambiato a ${agente.nome} ${agente.cognome}` });
  } catch (err) {
    console.error('[cambia-agente] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/modifica-deadline
router.post('/pratiche-dettaglio/:id/modifica-deadline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nuova_data, motivazione } = req.body as { nuova_data: string; motivazione: string };
    if (!nuova_data || !motivazione) {
      res.status(400).json({ error: 'nuova_data e motivazione obbligatori' });
      return;
    }

    await prisma.contratto_EOL.update({
      where: { id: req.params.id as string },
      data: { data_scadenza: new Date(nuova_data) },
    });

    await registraEvento(
      req.params.id as string,
      'BACKOFFICE',
      (req.user as any)?.id || 'system',
      'MODIFICA_BACKOFFICE',
      { sotto_azione: 'MODIFICA_DEADLINE', nuova_data, motivazione },
    );

    res.json({ success: true, messaggio: 'Deadline modificata' });
  } catch (err) {
    console.error('[modifica-deadline] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/decisione-manuale
router.post('/pratiche-dettaglio/:id/decisione-manuale', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { decisione, note } = req.body as { decisione: string; note?: string };
    const valid = ['RINNOVO', 'RIACQUISTO', 'CONTATTO', 'RESTITUZIONE'];
    if (!decisione || !valid.includes(decisione)) {
      res.status(400).json({ error: 'Decisione non valida' });
      return;
    }

    const statoMap: Record<string, string> = {
      RINNOVO: 'DECISIONE_RINNOVO',
      RIACQUISTO: 'DECISIONE_RIACQUISTO',
      CONTATTO: 'DECISIONE_CONTATTO',
      RESTITUZIONE: 'DECISIONE_RESTITUZIONE',
    };

    await prisma.decisione_Cliente.create({
      data: {
        contratto_eol_id: req.params.id as string,
        opzione_scelta: decisione,
        otp_verificato: false,
        otp_metodo: 'MANUALE_BACKOFFICE',
        note_cliente: note ? `[Inserimento manuale] ${note}` : '[Inserimento manuale da backoffice]',
      },
    });

    await prisma.contratto_EOL.update({
      where: { id: req.params.id as string },
      data: { stato: statoMap[decisione] },
    });

    await registraEvento(
      req.params.id as string,
      'BACKOFFICE',
      (req.user as any)?.id || 'system',
      'MODIFICA_BACKOFFICE',
      { sotto_azione: 'DECISIONE_MANUALE', decisione, note },
    );

    res.json({ success: true, messaggio: `Decisione ${decisione} registrata manualmente` });
  } catch (err) {
    console.error('[decisione-manuale] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/reinvia-comunicazione
router.post('/pratiche-dettaglio/:id/reinvia-comunicazione', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await inviaComunicazioneIniziale(req.params.id as string);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[reinvia-comunicazione] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/segna-richiamato
router.post('/pratiche-dettaglio/:id/segna-richiamato', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { richiesta_id } = req.body as { richiesta_id: string };
    await prisma.richiesta_Contatto.update({
      where: { id: richiesta_id },
      data: { stato: 'RICHIAMATO', data_richiamato: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[segna-richiamato] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── LISTA AGENTI ──────────────────────────────────────────────────────────

// GET /api/backoffice/agenti
router.get('/agenti', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const agenti = await prisma.utente_NSM.findMany({
      where: { attivo: true },
      select: { id: true, nome: true, cognome: true, email: true, ruolo: true },
      orderBy: { cognome: 'asc' },
    });
    res.json(agenti);
  } catch (err) {
    console.error('[agenti] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── OUTLIER ───────────────────────────────────────────────────────────────

// GET /api/backoffice/outliers
router.get('/outliers', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const outliers = await prisma.contratto_EOL.findMany({
      where: { stato_riconciliazione: 'OUTLIER_DA_GESTIRE' },
      include: {
        cliente: { select: { ragione_sociale: true, piva: true, email: true } },
      },
      orderBy: { data_importazione: 'desc' },
    });
    res.json(outliers);
  } catch (err) {
    console.error('[outliers] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/outliers/:id/suggestions
router.get('/outliers/:id/suggestions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const outlier = await prisma.contratto_EOL.findUnique({
      where: { id: req.params.id as string },
      include: { cliente: true },
    });
    if (!outlier) {
      res.status(404).json({ error: 'Outlier non trovato' });
      return;
    }

    const clienti = await prisma.cliente.findMany({
      select: { id: true, ragione_sociale: true, piva: true, email: true },
    });

    const searchTerm = outlier.cliente.ragione_sociale.toLowerCase();
    const searchPiva = outlier.cliente.piva;

    const scored = clienti
      .filter(c => c.id !== outlier.cliente_id)
      .map(c => {
        let score = 0;
        if (c.piva === searchPiva) score += 100;
        const name = c.ragione_sociale.toLowerCase();
        if (name === searchTerm) score += 50;
        else if (name.includes(searchTerm) || searchTerm.includes(name)) score += 30;
        else {
          const words = searchTerm.split(/\s+/);
          for (const w of words) {
            if (w.length > 2 && name.includes(w)) score += 10;
          }
        }
        return { ...c, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json(scored);
  } catch (err) {
    console.error('[outlier-suggestions] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/outliers/:id/resolve
router.post('/outliers/:id/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, clienteId, motivazione } = req.body as {
      action: 'ASSOCIA' | 'CREA' | 'SCARTA';
      clienteId?: string;
      motivazione?: string;
    };

    if (!action || !['ASSOCIA', 'CREA', 'SCARTA'].includes(action)) {
      res.status(400).json({ error: 'Azione non valida' });
      return;
    }

    if (action === 'SCARTA' && !motivazione) {
      res.status(400).json({ error: 'Motivazione obbligatoria per scarto' });
      return;
    }

    if (action === 'ASSOCIA' && !clienteId) {
      res.status(400).json({ error: 'clienteId obbligatorio per associazione' });
      return;
    }

    const nuovoStato = action === 'SCARTA' ? 'SCARTATO' : 'OUTLIER_RISOLTO';

    if (action === 'ASSOCIA') {
      await prisma.contratto_EOL.update({
        where: { id: req.params.id as string },
        data: { cliente_id: clienteId!, stato_riconciliazione: nuovoStato },
      });
    } else {
      await prisma.contratto_EOL.update({
        where: { id: req.params.id as string },
        data: { stato_riconciliazione: nuovoStato },
      });
    }

    res.json({ success: true, messaggio: `Outlier risolto con azione ${action}` });
  } catch (err) {
    console.error('[outlier-resolve] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── REPORTISTICA ──────────────────────────────────────────────────────────

function parsePeriodo(periodo: string): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (periodo === 'mese') {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  } else if (periodo === 'trimestre') {
    const q = Math.floor(month / 3);
    return { start: new Date(year, q * 3, 1), end: new Date(year, q * 3 + 3, 1) };
  }
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

// GET /api/backoffice/reports/sintesi
router.get('/reports/sintesi', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { periodo = 'anno' } = req.query as { periodo?: string };
    const { start, end } = parsePeriodo(periodo);

    const pratiche = await prisma.contratto_EOL.findMany({
      where: {
        data_scadenza: { gte: start, lt: end },
        stato: { not: 'FLEX_ATTIVO' },
      },
      select: { id: true, stato: true, margine_lordo: true, data_scadenza: true },
    });

    const total = pratiche.length;
    const silenzi = pratiche.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
    const rinnovi = pratiche.filter(p => ['DECISIONE_RINNOVO', 'RINNOVO_IN_CORSO'].includes(p.stato)).length;
    const riacquisti = pratiche.filter(p => ['DECISIONE_RIACQUISTO', 'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO'].includes(p.stato)).length;
    const restituzioni = pratiche.filter(p => ['DECISIONE_RESTITUZIONE', 'RESTITUZIONE_CONFERMATA'].includes(p.stato)).length;

    const statiChiusi = ['DECISIONE_RINNOVO', 'DECISIONE_RIACQUISTO', 'DECISIONE_CONTATTO', 'DECISIONE_RESTITUZIONE',
      'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO', 'RINNOVO_IN_CORSO', 'RESTITUZIONE_CONFERMATA', 'SILENZIO_PERDITA_DEFINITIVA'];
    const chiuse = pratiche.filter(p => statiChiusi.includes(p.stato)).length;

    const months: { mese: string; tasso_non_silenzio: number; rinnovi: number; riacquisti: number; restituzioni: number; silenzi: number }[] = [];

    for (let m = start.getMonth(); m < (periodo === 'anno' ? 12 : start.getMonth() + (periodo === 'trimestre' ? 3 : 1)); m++) {
      const mStart = new Date(start.getFullYear(), m, 1);
      const mEnd = new Date(start.getFullYear(), m + 1, 1);
      const mp = pratiche.filter(p => p.data_scadenza >= mStart && p.data_scadenza < mEnd);
      const mc = mp.filter(p => statiChiusi.includes(p.stato));
      const ms = mp.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
      const tns = mc.length > 0 ? ((mc.length - ms) / mc.length) * 100 : 0;

      months.push({
        mese: mStart.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
        tasso_non_silenzio: Math.round(tns * 10) / 10,
        rinnovi: mp.filter(p => ['DECISIONE_RINNOVO', 'RINNOVO_IN_CORSO'].includes(p.stato)).length,
        riacquisti: mp.filter(p => ['DECISIONE_RIACQUISTO', 'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO'].includes(p.stato)).length,
        restituzioni: mp.filter(p => ['DECISIONE_RESTITUZIONE', 'RESTITUZIONE_CONFERMATA'].includes(p.stato)).length,
        silenzi: ms,
      });
    }

    res.json({
      totale: total,
      rinnovi,
      riacquisti,
      restituzioni,
      silenzi,
      tasso_non_silenzio: chiuse > 0 ? Math.round(((chiuse - silenzi) / chiuse) * 1000) / 10 : 0,
      per_mese: months,
    });
  } catch (err) {
    console.error('[reports/sintesi] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/reports/perdite-silenzio
router.get('/reports/perdite-silenzio', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { periodo = 'anno' } = req.query as { periodo?: string };
    const { start, end } = parsePeriodo(periodo);

    const pratiche = await prisma.contratto_EOL.findMany({
      where: {
        data_scadenza: { gte: start, lt: end },
        stato: 'SILENZIO_PERDITA_DEFINITIVA',
      },
      include: { cliente: { select: { ragione_sociale: true } } },
      orderBy: { margine_lordo: 'desc' },
    });

    const totale_perso = pratiche.reduce((s, p) => s + Number(p.margine_lordo), 0);

    res.json({
      totale_perso: Math.round(totale_perso * 100) / 100,
      numero_pratiche: pratiche.length,
      dettaglio: pratiche.map(p => ({
        id: p.id,
        contratto_nsm: p.contratto_nsm_id,
        cliente: p.cliente.ragione_sociale,
        margine_perso: Number(p.margine_lordo),
        data_scadenza: p.data_scadenza,
      })),
    });
  } catch (err) {
    console.error('[reports/perdite-silenzio] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/reports/performance-agenti
router.get('/reports/performance-agenti', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { periodo = 'anno' } = req.query as { periodo?: string };
    const { start, end } = parsePeriodo(periodo);

    const agenti = await prisma.utente_NSM.findMany({
      where: { attivo: true, ruolo: { in: ['AGENTE', 'JUNIOR_AGENT', 'CAPO_AREA'] } },
      select: { id: true, nome: true, cognome: true, ruolo: true },
    });

    const pratiche = await prisma.contratto_EOL.findMany({
      where: {
        data_scadenza: { gte: start, lt: end },
        stato: { not: 'FLEX_ATTIVO' },
        agente_assegnato_id: { not: null },
      },
      select: { agente_assegnato_id: true, stato: true, margine_lordo: true },
    });

    const statiChiusi = ['DECISIONE_RINNOVO', 'DECISIONE_RIACQUISTO', 'DECISIONE_CONTATTO', 'DECISIONE_RESTITUZIONE',
      'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO', 'RINNOVO_IN_CORSO', 'RESTITUZIONE_CONFERMATA', 'SILENZIO_PERDITA_DEFINITIVA'];

    const result = agenti.map(a => {
      const mine = pratiche.filter(p => p.agente_assegnato_id === a.id);
      const chiuse = mine.filter(p => statiChiusi.includes(p.stato));
      const silenzi = mine.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
      const margine = mine.reduce((s, p) => s + Number(p.margine_lordo), 0);
      const tns = chiuse.length > 0 ? ((chiuse.length - silenzi) / chiuse.length) * 100 : 0;

      return {
        agente: `${a.nome} ${a.cognome}`,
        ruolo: a.ruolo,
        pratiche_totali: mine.length,
        tasso_non_silenzio: Math.round(tns * 10) / 10,
        margine_generato: Math.round(margine * 100) / 100,
        silenzi,
      };
    });

    res.json(result.sort((a, b) => b.pratiche_totali - a.pratiche_totali));
  } catch (err) {
    console.error('[reports/performance-agenti] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── GRENKE EXPORT ────────────────────────────────────────────────────────

import { previewExport, generaExcel, getStorico } from '../services/grenke-export.service.js';
import { readFileSync } from 'fs';
import { resolve as pathResolve, dirname as pathDirname } from 'path';
import { fileURLToPath as pathFileURLToPath } from 'url';

const __exportDir = pathResolve(pathDirname(pathFileURLToPath(import.meta.url)), '../../../backend/storage/grenke-exports');

router.get('/grenke-export/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { da, a } = req.query as { da?: string; a?: string };
    if (!da || !a) {
      res.status(400).json({ error: 'Parametri da e a obbligatori (formato YYYY-MM-DD)' });
      return;
    }
    const rows = await previewExport(da, a);
    res.json(rows);
  } catch (err) {
    console.error('[grenke-export/preview] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.post('/grenke-export/genera', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { da, a, esclusi } = req.body as { da: string; a: string; esclusi?: string[] };
    if (!da || !a) {
      res.status(400).json({ error: 'Parametri da e a obbligatori' });
      return;
    }
    const operatoreId = (req.user as any)?.id || 'system';
    const result = await generaExcel(da, a, esclusi || [], operatoreId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[grenke-export/genera] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/grenke-export/storico', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(getStorico());
  } catch (err) {
    console.error('[grenke-export/storico] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/grenke-export/download/:filename', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filename = req.params.filename as string;
    if (!filename.startsWith('lista_riacquisti_') || !filename.endsWith('.xlsx')) {
      res.status(400).json({ error: 'Filename non valido' });
      return;
    }
    const filepath = pathResolve(__exportDir, filename);
    const file = readFileSync(filepath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(file);
  } catch (err) {
    console.error('[grenke-export/download] Errore:', err);
    res.status(404).json({ error: 'File non trovato' });
  }
});

// ─── AUDIT LOG ────────────────────────────────────────────────────────────

import { verificaCatena } from '../services/audit.service.js';

router.get('/pratiche-dettaglio/:id/audit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventi = await prisma.audit_Event.findMany({
      where: { contratto_eol_id: req.params.id as string },
      orderBy: { timestamp: 'asc' },
    });
    res.json(eventi);
  } catch (err) {
    console.error('[audit] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/pratiche-dettaglio/:id/audit/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await verificaCatena(req.params.id as string);
    res.json(result);
  } catch (err) {
    console.error('[audit/verify] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

export default router;
