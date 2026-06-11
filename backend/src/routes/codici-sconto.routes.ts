import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, verifyBackofficeToken } from '../middleware/auth.middleware.js';
import { marcaUtilizzato, annullaCodice } from '../services/codice-sconto.service.js';
import { prisma } from '../lib/db.js';

const router = Router();

router.use(verifyBackofficeToken as any);

// Solo backoffice interno e admin gestiscono i codici sconto
function soloInternoOAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const ruolo = (req.user as any)?.ruolo;
  if (ruolo !== 'ADMIN' && ruolo !== 'BACKOFFICE_INTERNO') {
    res.status(403).json({ error: 'Ruolo non autorizzato: solo ADMIN o BACKOFFICE_INTERNO' });
    return;
  }
  next();
}

router.use(soloInternoOAdmin as any);

function buildWhere(query: Record<string, string>): any {
  const { stato, data_from, data_to, search } = query;
  const where: any = {};
  if (stato) where.stato = stato;
  if (data_from || data_to) {
    where.data_generazione = {};
    if (data_from) where.data_generazione.gte = new Date(data_from);
    if (data_to) {
      const to = new Date(data_to);
      to.setHours(23, 59, 59, 999);
      where.data_generazione.lte = to;
    }
  }
  if (search) {
    where.OR = [
      { codice: { contains: search.toUpperCase() } },
      { piva_cliente: { contains: search } },
    ];
  }
  return where;
}

// GET /api/backoffice/codici-sconto
router.get('/codici-sconto', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const where = buildWhere(req.query as Record<string, string>);
    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const [codici, total] = await prisma.$transaction([
      prisma.codice_Sconto.findMany({
        where,
        include: {
          contratto_eol: {
            select: {
              id: true,
              contratto_nsm_id: true,
              cliente: { select: { ragione_sociale: true } },
            },
          },
        },
        orderBy: { data_generazione: 'desc' },
        skip,
        take,
      }),
      prisma.codice_Sconto.count({ where }),
    ]);

    res.json({
      codici: codici.map(c => ({
        id: c.id,
        codice: c.codice,
        valore_eur: Number(c.valore_eur),
        stato: c.stato,
        piva_cliente: c.piva_cliente,
        cliente: c.contratto_eol.cliente.ragione_sociale,
        contratto_eol_id: c.contratto_eol.id,
        contratto_nsm_id: c.contratto_eol.contratto_nsm_id,
        data_generazione: c.data_generazione,
        data_scadenza: c.data_scadenza,
        data_utilizzo: c.data_utilizzo,
        note: c.note,
      })),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (err) {
    console.error('[codici-sconto] Errore lista:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/codici-sconto/export-csv
router.get('/codici-sconto/export-csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const where = buildWhere(req.query as Record<string, string>);
    const codici = await prisma.codice_Sconto.findMany({
      where,
      include: {
        contratto_eol: {
          select: { contratto_nsm_id: true, cliente: { select: { ragione_sociale: true } } },
        },
      },
      orderBy: { data_generazione: 'desc' },
    });

    const fmtData = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '');
    const header = 'Codice;Cliente;P.IVA;Valore;Stato;Data generazione;Data scadenza;Data utilizzo;Contratto NSM\n';
    const rows = codici.map(c =>
      `${c.codice};${c.contratto_eol.cliente.ragione_sociale};${c.piva_cliente};${Number(c.valore_eur).toFixed(2)};${c.stato};${fmtData(c.data_generazione)};${fmtData(c.data_scadenza)};${fmtData(c.data_utilizzo)};${c.contratto_eol.contratto_nsm_id}`,
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="codici_sconto.csv"');
    res.send('﻿' + header + rows);
  } catch (err) {
    console.error('[codici-sconto] Errore export CSV:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/codici-sconto/:id/segna-utilizzato
router.post('/codici-sconto/:id/segna-utilizzato', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const attoreId = (req.user as any)?.id || 'system';
    const codice = await marcaUtilizzato(req.params.id as string, attoreId);
    res.json({ success: true, messaggio: `Codice ${codice.codice} segnato come utilizzato`, codice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore interno';
    if (msg.includes('non trovato')) {
      res.status(404).json({ error: msg });
    } else if (msg.includes('non in stato GENERATO')) {
      res.status(409).json({ error: msg });
    } else {
      console.error('[codici-sconto] Errore segna-utilizzato:', err);
      res.status(500).json({ error: 'Errore interno' });
    }
  }
});

// POST /api/backoffice/codici-sconto/:id/annulla
router.post('/codici-sconto/:id/annulla', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { motivo } = req.body as { motivo?: string };
    if (!motivo || !motivo.trim()) {
      res.status(400).json({ error: 'Motivo obbligatorio per annullare un codice' });
      return;
    }
    const attoreId = (req.user as any)?.id || 'system';
    const codice = await annullaCodice(req.params.id as string, motivo.trim(), attoreId);
    res.json({ success: true, messaggio: `Codice ${codice.codice} annullato`, codice });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore interno';
    if (msg.includes('non trovato')) {
      res.status(404).json({ error: msg });
    } else if (msg.includes('non in stato GENERATO')) {
      res.status(409).json({ error: msg });
    } else {
      console.error('[codici-sconto] Errore annulla:', err);
      res.status(500).json({ error: 'Errore interno' });
    }
  }
});

export default router;
