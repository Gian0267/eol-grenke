/**
 * Anagrafica delle agenzie e dei loro link di registrazione a un nuovo
 * noleggio.
 *
 * Il link porta l'identificativo dell'agente: usare quello sbagliato attribuisce
 * il contatto a un'altra persona, quindi qui si e' prudenti — niente link di
 * riserva, niente scorciatoie.
 */
import { Router, Response } from 'express';
import { verifyBackofficeToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { normalizzaOrigine, origineCorrisponde } from '../lib/origine.js';
import * as configService from '../services/config.service.js';
import { prisma } from '../lib/db.js';

const router = Router();
router.use(verifyBackofficeToken as any);

function soloGestori(req: AuthenticatedRequest, res: Response): boolean {
  const ruolo = (req.user as any)?.ruolo;
  if (['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) return true;
  res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
  return false;
}

/** Un link vale solo se e' un indirizzo http(s): un refuso qui manda il cliente nel vuoto. */
function linkValido(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /api/backoffice/agenzie — elenco con quante pratiche fanno capo a ciascuna
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const agenzie = await prisma.agenzia.findMany({ orderBy: { nome: 'asc' } });

    // Le pratiche non hanno una chiave verso l'agenzia: il legame e' il nome
    // scritto nell'export NSM, quindi il confronto e' tollerante.
    const perNome = await prisma.contratto_EOL.groupBy({ by: ['agenzia'], _count: true });
    const conteggi = new Map<string, number>();
    for (const r of perNome) {
      if (!r.agenzia) continue;
      const k = normalizzaOrigine(r.agenzia);
      conteggi.set(k, (conteggi.get(k) ?? 0) + r._count);
    }

    // Nomi che compaiono sulle pratiche ma non in anagrafica: sono i casi in
    // cui la proposta non partirebbe, e vanno visti.
    //
    // Si raggruppano per nome normalizzato, altrimenti "Italiaonline" e
    // "ItaliaOnline" figurerebbero come due voci distinte, ciascuna con il
    // totale di entrambe. Ed e' proprio Italiaonline a restare fuori da questo
    // elenco: ha un link unico nelle Impostazioni e non le serve un'agenzia.
    const dicitureIol = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
      .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);
    const conosciute = new Set(agenzie.map(a => normalizzaOrigine(a.nome)));
    const orfanePerChiave = new Map<string, { nome: string; pratiche: number }>();
    for (const r of perNome) {
      if (!r.agenzia) continue;
      const k = normalizzaOrigine(r.agenzia);
      if (conosciute.has(k)) continue;
      if (origineCorrisponde(r.agenzia, dicitureIol)) continue;
      if (!orfanePerChiave.has(k)) orfanePerChiave.set(k, { nome: r.agenzia, pratiche: conteggi.get(k) ?? 0 });
    }
    const orfane = [...orfanePerChiave.values()];

    res.json({
      agenzie: agenzie.map(a => ({
        ...a,
        pratiche: conteggi.get(normalizzaOrigine(a.nome)) ?? 0,
      })),
      orfane,
      senza_link: agenzie.filter(a => !a.link_onboarding).length,
    });
  } catch (err) {
    console.error('[agenzie] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/agenzie — nuova agenzia
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!soloGestori(req, res)) return;
    const { nome, link_onboarding, note } = req.body as Record<string, unknown>;
    const n = typeof nome === 'string' ? nome.trim() : '';
    if (!n) { res.status(400).json({ error: 'Nome obbligatorio' }); return; }

    const link = typeof link_onboarding === 'string' && link_onboarding.trim() ? link_onboarding.trim() : null;
    if (link && !linkValido(link)) { res.status(400).json({ error: 'Il link non e\' un indirizzo valido' }); return; }

    const esistente = await prisma.agenzia.findFirst({ where: { nome: { equals: n, mode: 'insensitive' } } });
    if (esistente) { res.status(409).json({ error: `"${esistente.nome}" e' gia' in anagrafica` }); return; }

    const creata = await prisma.agenzia.create({
      data: { nome: n, link_onboarding: link, note: typeof note === 'string' && note.trim() ? note.trim() : null },
    });
    res.json({ success: true, agenzia: creata });
  } catch (err) {
    console.error('[agenzie/crea] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/agenzie/:id — aggiorna nome, link o note
router.post('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!soloGestori(req, res)) return;
    const { nome, link_onboarding, note } = req.body as Record<string, unknown>;

    const a = await prisma.agenzia.findUnique({ where: { id: req.params.id as string } });
    if (!a) { res.status(404).json({ error: 'Agenzia non trovata' }); return; }

    const dati: Record<string, unknown> = {};

    if (typeof nome === 'string') {
      const n = nome.trim();
      if (!n) { res.status(400).json({ error: 'Nome obbligatorio' }); return; }
      if (n.toLowerCase() !== a.nome.toLowerCase()) {
        const altro = await prisma.agenzia.findFirst({ where: { nome: { equals: n, mode: 'insensitive' } } });
        if (altro) { res.status(409).json({ error: `"${altro.nome}" e' gia' in anagrafica` }); return; }
      }
      dati.nome = n;
    }

    if (link_onboarding !== undefined) {
      const l = typeof link_onboarding === 'string' ? link_onboarding.trim() : '';
      if (l && !linkValido(l)) { res.status(400).json({ error: 'Il link non e\' un indirizzo valido' }); return; }
      dati.link_onboarding = l || null;
    }

    if (note !== undefined) {
      const t = typeof note === 'string' ? note.trim() : '';
      dati.note = t || null;
    }

    const agg = await prisma.agenzia.update({ where: { id: a.id }, data: dati });
    res.json({ success: true, agenzia: agg });
  } catch (err) {
    console.error('[agenzie/aggiorna] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/agenzie/:id/elimina
router.post('/:id/elimina', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!soloGestori(req, res)) return;
    const a = await prisma.agenzia.findUnique({ where: { id: req.params.id as string } });
    if (!a) { res.status(404).json({ error: 'Agenzia non trovata' }); return; }

    // Le pratiche conservano il nome dell'agenzia per conto loro: eliminarla
    // qui non le tocca, fa solo sparire il link. Meglio dirlo che scoprirlo.
    const pratiche = await prisma.contratto_EOL.count({
      where: { agenzia: { equals: a.nome, mode: 'insensitive' } },
    });

    await prisma.agenzia.delete({ where: { id: a.id } });
    res.json({ success: true, pratiche_coinvolte: pratiche });
  } catch (err) {
    console.error('[agenzie/elimina] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

export default router;
