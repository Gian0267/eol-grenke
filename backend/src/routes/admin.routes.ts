import { Router, Response } from 'express';
import { runScheduler } from '../services/scheduler.service.js';
import { verificaCatena } from '../services/audit.service.js';
import { generaAuditExport } from '../services/pdf.service.js';
import { readFileSync } from 'fs';
import { prisma } from '../lib/db.js';

const router = Router();

interface AdminRequest {
  headers: Record<string, string | string[] | undefined>;
  body: any;
  user?: { id: string; ruolo: string };
  isAuthenticated?: () => boolean;
}

async function verifyAdmin(req: any, res: Response): Promise<boolean> {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const ruolo = (req.user as any).ruolo;
    if (ruolo === 'ADMIN' || ruolo === 'BACKOFFICE_INTERNO') return true;
    res.status(403).json({ error: 'Ruolo non autorizzato' });
    return false;
  }

  const userId = req.headers['x-user-id'] as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Autenticazione richiesta' });
    return false;
  }

  const utente = await prisma.utente_NSM.findUnique({ where: { id: userId } });
  if (!utente || !utente.attivo) {
    res.status(401).json({ error: 'Utente non trovato o disattivato' });
    return false;
  }
  if (utente.ruolo !== 'ADMIN' && utente.ruolo !== 'BACKOFFICE_INTERNO') {
    res.status(403).json({ error: 'Ruolo non autorizzato: solo ADMIN o BACKOFFICE_INTERNO' });
    return false;
  }

  return true;
}

router.post('/scheduler/run-now', async (req: any, res: Response) => {
  try {
    const authorized = await verifyAdmin(req, res);
    if (!authorized) return;

    const { simulate_date } = req.body as { simulate_date?: string };
    let referenceDate: Date | undefined;

    if (simulate_date) {
      referenceDate = new Date(simulate_date);
      if (isNaN(referenceDate.getTime())) {
        res.status(400).json({ error: 'simulate_date non valida. Formato atteso: YYYY-MM-DD' });
        return;
      }
    }

    console.log(`[Admin] Trigger manuale scheduler${referenceDate ? ` con data simulata: ${simulate_date}` : ''}`);
    const report = await runScheduler(referenceDate);

    res.json({ success: true, report });
  } catch (err) {
    console.error('[Admin] Errore scheduler run-now:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

router.get('/audit/verify/:contratto_id', async (req: any, res: Response) => {
  try {
    const authorized = await verifyAdmin(req, res);
    if (!authorized) return;

    const result = await verificaCatena(req.params.contratto_id as string);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Errore audit verify:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

router.get('/audit/:contratto_id', async (req: any, res: Response) => {
  try {
    const authorized = await verifyAdmin(req, res);
    if (!authorized) return;

    const eventi = await prisma.audit_Event.findMany({
      where: { contratto_eol_id: req.params.contratto_id as string },
      orderBy: { timestamp: 'asc' },
    });
    res.json(eventi);
  } catch (err) {
    console.error('[Admin] Errore audit list:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

router.get('/audit/export/:contratto_id', async (req: any, res: Response) => {
  try {
    const authorized = await verifyAdmin(req, res);
    if (!authorized) return;

    const { pdfPath } = await generaAuditExport(req.params.contratto_id as string);
    const pdf = readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${req.params.contratto_id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[Admin] Errore audit export:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

export default router;
