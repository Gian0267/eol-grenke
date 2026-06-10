import { Router, Response } from 'express';
import { runScheduler } from '../services/scheduler.service.js';
import { verificaCatena } from '../services/audit.service.js';
import { generaAuditExport } from '../services/pdf.service.js';
import { resetTestData } from '../services/test-data.service.js';
import { prisma } from '../lib/db.js';
import bcrypt from 'bcryptjs';

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

    const { buffer: pdf } = await generaAuditExport(req.params.contratto_id as string);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${req.params.contratto_id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[Admin] Errore audit export:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// ─── RESET DATI DI TEST ─────────────────────────────────────────
// SOLO PER LA FASE DI TEST — rimuovere prima della produzione effettiva.
// Svuota tutti i dati operativi e ricrea 15 pratiche vergini.
// Non tocca utenti e impostazioni.
router.post('/test/reset-pratiche', async (req: any, res: Response) => {
  try {
    const authorized = await verifyAdmin(req, res);
    if (!authorized) return;

    const result = await resetTestData();
    res.json({ success: true, ...result });
  } catch (err) {
    console.log('[Admin] Errore reset dati di test:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// ─── GESTIONE UTENTI ────────────────────────────────────────────

const RUOLI_VALIDI = ['ADMIN', 'BACKOFFICE_INTERNO', 'AGENZIA', 'CAPO_AREA', 'GROUP_MANAGER', 'AGENTE', 'JUNIOR_AGENT'];

// Gerarchia agenti: chi può essere superiore di chi
const GERARCHIA_SUPERIORE: Record<string, string[]> = {
  CAPO_AREA: ['AGENZIA'],            // un Capo Area risponde a un'Agenzia
  GROUP_MANAGER: ['CAPO_AREA'],       // un Group Manager risponde a un Capo Area
  AGENTE: ['GROUP_MANAGER'],          // un Agente risponde a un Group Manager
  JUNIOR_AGENT: ['GROUP_MANAGER'],    // un Junior Agent risponde a un Group Manager
};

const UTENTE_SELECT = {
  id: true, nome: true, cognome: true, email: true, ruolo: true,
  attivo: true, created_at: true, superiore_id: true,
  superiore: { select: { id: true, nome: true, cognome: true, ruolo: true } },
};

// GET /api/admin/utenti
router.get('/utenti', async (req: any, res: Response) => {
  const authorized = await verifyAdmin(req, res);
  if (!authorized) return;
  const utenti = await prisma.utente_NSM.findMany({
    select: UTENTE_SELECT,
    orderBy: { created_at: 'asc' },
  });
  res.json(utenti);
});

// POST /api/admin/utenti
router.post('/utenti', async (req: any, res: Response) => {
  const authorized = await verifyAdmin(req, res);
  if (!authorized) return;
  const { nome, cognome, email, ruolo, password } = req.body as Record<string, string>;
  if (!nome || !cognome || !email || !ruolo || !password) {
    res.status(400).json({ errore: 'Campi obbligatori: nome, cognome, email, ruolo, password' });
    return;
  }
  if (!RUOLI_VALIDI.includes(ruolo)) {
    res.status(400).json({ errore: `Ruolo non valido. Valori accettati: ${RUOLI_VALIDI.join(', ')}` });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ errore: 'La password deve essere di almeno 8 caratteri' });
    return;
  }
  const esistente = await prisma.utente_NSM.findUnique({ where: { email } });
  if (esistente) {
    res.status(409).json({ errore: 'Email già in uso' });
    return;
  }
  const { superiore_id } = req.body as { superiore_id?: string };
  // Validazione gerarchia
  if (superiore_id && GERARCHIA_SUPERIORE[ruolo]) {
    const sup = await prisma.utente_NSM.findUnique({ where: { id: superiore_id }, select: { ruolo: true } });
    if (!sup || !GERARCHIA_SUPERIORE[ruolo]!.includes(sup.ruolo)) {
      res.status(400).json({ errore: `Il ruolo ${ruolo} può avere come superiore solo: ${GERARCHIA_SUPERIORE[ruolo]!.join(', ')}` });
      return;
    }
  }
  const hash = await bcrypt.hash(password, 10);
  const utente = await prisma.utente_NSM.create({
    data: { nome, cognome, email, ruolo, password: hash, superiore_id: superiore_id || null },
    select: UTENTE_SELECT,
  });
  res.status(201).json(utente);
});

// PUT /api/admin/utenti/:id
router.put('/utenti/:id', async (req: any, res: Response) => {
  const authorized = await verifyAdmin(req, res);
  if (!authorized) return;
  const { nome, cognome, email, ruolo, password } = req.body as Record<string, string>;
  if (ruolo && !RUOLI_VALIDI.includes(ruolo)) {
    res.status(400).json({ errore: `Ruolo non valido` });
    return;
  }
  if (email) {
    const esistente = await prisma.utente_NSM.findFirst({ where: { email, NOT: { id: req.params.id } } });
    if (esistente) { res.status(409).json({ errore: 'Email già in uso' }); return; }
  }
  const { superiore_id } = req.body as { superiore_id?: string | null };
  const updateData: Record<string, any> = {};
  if (nome) updateData.nome = nome;
  if (cognome) updateData.cognome = cognome;
  if (email) updateData.email = email;
  if (ruolo) updateData.ruolo = ruolo;
  if (password) {
    if (password.length < 8) { res.status(400).json({ errore: 'Password minimo 8 caratteri' }); return; }
    updateData.password = await bcrypt.hash(password, 10);
  }
  if (superiore_id !== undefined) {
    if (superiore_id && ruolo && GERARCHIA_SUPERIORE[ruolo]) {
      const sup = await prisma.utente_NSM.findUnique({ where: { id: superiore_id }, select: { ruolo: true } });
      if (!sup || !GERARCHIA_SUPERIORE[ruolo]!.includes(sup.ruolo)) {
        res.status(400).json({ errore: `Il ruolo ${ruolo} può avere come superiore solo: ${GERARCHIA_SUPERIORE[ruolo]!.join(', ')}` });
        return;
      }
    }
    updateData.superiore_id = superiore_id;
  }
  const utente = await prisma.utente_NSM.update({
    where: { id: req.params.id },
    data: updateData,
    select: UTENTE_SELECT,
  });
  res.json(utente);
});

// PATCH /api/admin/utenti/:id/attivo
router.patch('/utenti/:id/attivo', async (req: any, res: Response) => {
  const authorized = await verifyAdmin(req, res);
  if (!authorized) return;
  const { attivo } = req.body as { attivo: boolean };
  const utente = await prisma.utente_NSM.update({
    where: { id: req.params.id },
    data: { attivo },
    select: UTENTE_SELECT,
  });
  res.json(utente);
});

export default router;
