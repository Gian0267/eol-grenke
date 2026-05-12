import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, verifyBackofficeToken } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

router.use(verifyBackofficeToken as any);

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

// GET /api/backoffice/dashboard/risk-silence-counts
router.get('/risk-silence-counts', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: 'IN_ATTESA_DECISIONE' },
      select: { id: true, data_scadenza: true },
    });

    let t50 = 0, t40 = 0, t35 = 0;
    const t50Ids: string[] = [], t40Ids: string[] = [], t35Ids: string[] = [];

    for (const p of pratiche) {
      const giorni = diffDays(p.data_scadenza, now);
      if (giorni >= 31 && giorni <= 35) {
        t35++;
        t35Ids.push(p.id);
      } else if (giorni >= 36 && giorni <= 40) {
        t40++;
        t40Ids.push(p.id);
      } else if (giorni >= 41 && giorni <= 50) {
        t50++;
        t50Ids.push(p.id);
      }
    }

    res.json({ t50, t40, t35, t50Ids, t40Ids, t35Ids });
  } catch (err) {
    console.error('[risk-silence-counts] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/dashboard/kpi
router.get('/kpi', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const allPratiche = await prisma.contratto_EOL.findMany({
      where: {
        data_scadenza: { gte: startOfYear, lt: endOfYear },
        stato: { not: 'FLEX_ATTIVO' },
      },
      select: {
        id: true,
        stato: true,
        margine_lordo: true,
        data_scadenza: true,
        created_at: true,
      },
    });

    const total = allPratiche.length;
    if (total === 0) {
      res.json({
        tasso_non_silenzio: 0,
        tasso_rinnovo: 0,
        tasso_riacquisto: 0,
        margine_medio: 0,
        tempo_medio_decisione: 0,
        tasso_intervento_manuale: 0,
        totale_pratiche: 0,
      });
      return;
    }

    const silenzi = allPratiche.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
    const statiDecisione = ['DECISIONE_RINNOVO', 'DECISIONE_RIACQUISTO', 'DECISIONE_CONTATTO', 'DECISIONE_RESTITUZIONE',
      'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO', 'RINNOVO_IN_CORSO', 'RESTITUZIONE_CONFERMATA',
      'SILENZIO_PERDITA_DEFINITIVA'];
    const conDecisione = allPratiche.filter(p => statiDecisione.includes(p.stato));
    const chiuse = conDecisione.length;

    const nonSilenzio = chiuse > 0 ? ((chiuse - silenzi) / chiuse) * 100 : 0;

    const rinnovi = allPratiche.filter(p => ['DECISIONE_RINNOVO', 'RINNOVO_IN_CORSO'].includes(p.stato)).length;
    const riacquisti = allPratiche.filter(p => ['DECISIONE_RIACQUISTO', 'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO'].includes(p.stato)).length;

    const tassoRinnovo = chiuse > 0 ? (rinnovi / chiuse) * 100 : 0;
    const tassoRiacquisto = chiuse > 0 ? (riacquisti / chiuse) * 100 : 0;

    const margineTotale = allPratiche.reduce((s, p) => s + Number(p.margine_lordo), 0);
    const margineMedio = total > 0 ? margineTotale / total : 0;

    const decisioni = await prisma.decisione_Cliente.findMany({
      where: {
        created_at: { gte: startOfYear, lt: endOfYear },
      },
      select: { contratto_eol_id: true, created_at: true },
    });

    let tempoTotale = 0;
    let contDecisioni = 0;
    for (const d of decisioni) {
      const pratica = allPratiche.find(p => p.id === d.contratto_eol_id);
      if (pratica) {
        const giorni = diffDays(d.created_at, pratica.created_at);
        tempoTotale += giorni;
        contDecisioni++;
      }
    }
    const tempoMedio = contDecisioni > 0 ? tempoTotale / contDecisioni : 0;

    const escalation = await prisma.task_Escalation.count({
      where: { data_creazione: { gte: startOfYear, lt: endOfYear } },
    });
    const tassoIntervento = total > 0 ? (escalation / total) * 100 : 0;

    res.json({
      tasso_non_silenzio: Math.round(nonSilenzio * 10) / 10,
      tasso_rinnovo: Math.round(tassoRinnovo * 10) / 10,
      tasso_riacquisto: Math.round(tassoRiacquisto * 10) / 10,
      margine_medio: Math.round(margineMedio * 100) / 100,
      tempo_medio_decisione: Math.round(tempoMedio * 10) / 10,
      tasso_intervento_manuale: Math.round(tassoIntervento * 10) / 10,
      totale_pratiche: total,
    });
  } catch (err) {
    console.error('[kpi] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/dashboard/pratiche-recenti
router.get('/pratiche-recenti', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: { not: 'FLEX_ATTIVO' } },
      include: {
        cliente: { select: { ragione_sociale: true } },
      },
      orderBy: { updated_at: 'desc' },
      take: 10,
    });

    const result = pratiche.map(p => ({
      id: p.id,
      cliente: p.cliente.ragione_sociale,
      contratto_nsm: p.contratto_nsm_id,
      data_scadenza: p.data_scadenza,
      stato: p.stato,
      decisione: null as string | null,
    }));

    const ids = pratiche.map(p => p.id);
    const decisioni = await prisma.decisione_Cliente.findMany({
      where: { contratto_eol_id: { in: ids } },
      orderBy: { created_at: 'desc' },
    });
    const decMap = new Map<string, string>();
    for (const d of decisioni) {
      if (!decMap.has(d.contratto_eol_id)) {
        decMap.set(d.contratto_eol_id, d.opzione_scelta);
      }
    }
    for (const r of result) {
      r.decisione = decMap.get(r.id) || null;
    }

    res.json(result);
  } catch (err) {
    console.error('[pratiche-recenti] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

export default router;
