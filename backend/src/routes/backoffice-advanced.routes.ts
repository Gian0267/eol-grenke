import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, ambienteVista } from '../middleware/auth.middleware.js';
import { verifyBackofficeToken } from '../middleware/auth.middleware.js';
import { inviaComunicazioneIniziale, inviaPropostaNuovoNoleggio, TIPO_PROPOSTA_NOLEGGIO } from '../services/email.service.js';
import { registraEvento } from '../services/audit.service.js';
import { confermaBonificoRicevuto } from '../services/payment.service.js';
import { generaCodice, getCodicePerContratto } from '../services/codice-sconto.service.js';
import { parseBeni, parseEsclusi, beniInclusi, beniEsclusi, formatBene } from '../lib/beni.js';
import { origineCorrisponde, normalizzaOrigine } from '../lib/origine.js';
import * as configService from '../services/config.service.js';
import { calcolaValoreGiftCard } from '../services/pricing.service.js';
import { prisma } from '../lib/db.js';

const router = Router();

router.use(verifyBackofficeToken as any);

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

/**
 * Applica al `where` i due criteri che non si esprimono direttamente in query.
 *
 * "Rischio silenzio" e "Decisione" venivano valutati DOPO la paginazione, sulle
 * sole venti righe della pagina: il risultato erano pagine mezze vuote e un
 * totale che contava anche le pratiche scartate. Qui si ricavano prima gli id
 * che corrispondono, e si restringe la query: cosi' la paginazione torna a
 * dire il vero.
 *
 * La decisione considerata e' l'ULTIMA presa, non una qualsiasi: un cliente che
 * cambia idea non deve comparire sotto entrambe le scelte.
 */
async function restringiPerDecisioneERischio(
  req: AuthenticatedRequest,
  where: any,
  decisione?: string,
  rischioSilenzio?: string,
): Promise<void> {
  if (!decisione && rischioSilenzio !== 'true') return;

  const candidate = await prisma.contratto_EOL.findMany({
    where,
    select: {
      id: true, stato: true, data_scadenza: true,
      decisioni: { orderBy: { created_at: 'desc' as const }, take: 1, select: { opzione_scelta: true } },
    },
  });

  const now = new Date();
  const ammessi = candidate.filter(p => {
    if (rischioSilenzio === 'true') {
      if (p.stato !== 'IN_ATTESA_DECISIONE' || !p.data_scadenza) return false;
      const g = diffDays(p.data_scadenza, now);
      if (g < 31 || g > 50) return false;
    }
    if (decisione && (p.decisioni[0]?.opzione_scelta ?? null) !== decisione) return false;
    return true;
  }).map(p => p.id);

  where.id = { in: ammessi };
}

/**
 * Tutte le grafie con cui un'agenzia compare sulle pratiche.
 *
 * Il nome arriva dalla colonna A dell'export NSM e non e' una chiave: filtrare
 * per uguaglianza esatta lascerebbe fuori "Italiaonline" avendo scelto
 * "ItaliaOnline".
 */
async function grafieAgenzia(req: AuthenticatedRequest, scelta: string): Promise<string[]> {
  const righe = await prisma.contratto_EOL.findMany({
    where: { ambiente: ambienteVista(req) },
    select: { agenzia: true },
    distinct: ['agenzia'],
  });
  const k = normalizzaOrigine(scelta);
  const grafie = righe
    .map(r => r.agenzia)
    .filter((a): a is string => Boolean(a) && normalizzaOrigine(a) === k);
  // Nessuna corrispondenza: si passa comunque la scelta, cosi' il filtro
  // restituisce zero righe invece di ignorare in silenzio il criterio.
  return grafie.length > 0 ? grafie : [scelta];
}

// ─── LISTA PRATICHE AVANZATA ───────────────────────────────────────────────

// GET /api/backoffice/pratiche-avanzate/ids — solo gli id (con lo stato) di
// TUTTE le pratiche che rispettano i filtri, senza paginazione.
//
// Serve alla lista per il "seleziona tutte": la selezione a video arriva solo
// fino alla pagina corrente, e le azioni di gruppo che ne derivavano si
// fermavano a 20 pratiche senza dirlo. Torna un payload leggero (due campi per
// riga) proprio per poterlo chiedere sull'intero filtro.
router.get('/pratiche-avanzate/ids', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      stato, agente_id, data_scadenza_from, data_scadenza_to,
      origine, agenzia, cliente, decisione, rischio_silenzio,
    } = req.query as Record<string, string>;

    const where: any = { stato: { not: 'FLEX_ATTIVO' }, ambiente: ambienteVista(req) };
    if (stato) where.stato = stato;
    if (agente_id) where.agente_assegnato_id = agente_id;
    if (origine) where.origine = origine;
    // L'agenzia sulla pratica e' testo libero dell'export NSM: si filtra su
    // tutte le grafie che corrispondono, non sulla sola stringa scelta.
    if (agenzia) where.agenzia = { in: await grafieAgenzia(req, agenzia) };
    // Ricerca per nome cliente: parziale e senza distinzione fra maiuscole e
    // minuscole, perche' nessuno ricorda la ragione sociale per intero.
    if (cliente && cliente.trim()) {
      where.cliente = { ragione_sociale: { contains: cliente.trim(), mode: 'insensitive' } };
    }
    if (data_scadenza_from || data_scadenza_to) {
      where.data_scadenza = {};
      if (data_scadenza_from) where.data_scadenza.gte = new Date(data_scadenza_from);
      if (data_scadenza_to) where.data_scadenza.lte = new Date(data_scadenza_to);
    }

    await restringiPerDecisioneERischio(req, where, decisione, rischio_silenzio);

    const righe = await prisma.contratto_EOL.findMany({ where, select: { id: true, stato: true } });

    res.json({ ids: righe.map(p => ({ id: p.id, stato: p.stato })), total: righe.length });
  } catch (err) {
    console.error('[pratiche-avanzate/ids] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche-avanzate
router.get('/pratiche-avanzate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = '1', pageSize = '20',
      sortBy = 'updated_at', sortOrder = 'desc',
      stato, agente_id, data_scadenza_from, data_scadenza_to,
      origine, agenzia, cliente, decisione, rischio_silenzio,
    } = req.query as Record<string, string>;

    const skip = (Number(page) - 1) * Number(pageSize);
    const take = Number(pageSize);

    const where: any = { stato: { not: 'FLEX_ATTIVO' }, ambiente: ambienteVista(req) };

    if (stato) where.stato = stato;
    if (agente_id) where.agente_assegnato_id = agente_id;
    if (origine) where.origine = origine;
    // L'agenzia sulla pratica e' testo libero dell'export NSM: si filtra su
    // tutte le grafie che corrispondono, non sulla sola stringa scelta.
    if (agenzia) where.agenzia = { in: await grafieAgenzia(req, agenzia) };
    // Ricerca per nome cliente: parziale e senza distinzione fra maiuscole e
    // minuscole, perche' nessuno ricorda la ragione sociale per intero.
    if (cliente && cliente.trim()) {
      where.cliente = { ragione_sociale: { contains: cliente.trim(), mode: 'insensitive' } };
    }
    if (data_scadenza_from || data_scadenza_to) {
      where.data_scadenza = {};
      if (data_scadenza_from) where.data_scadenza.gte = new Date(data_scadenza_from);
      if (data_scadenza_to) where.data_scadenza.lte = new Date(data_scadenza_to);
    }

    await restringiPerDecisioneERischio(req, where, decisione, rischio_silenzio);

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
    const items = pratiche.map(p => {
      const giorni_a_scadenza = p.data_scadenza ? diffDays(p.data_scadenza, now) : null;
      return {
        id: p.id,
        contratto_nsm: p.contratto_nsm_id,
        contratto_grenke: p.contratto_grenke_id,
        cliente: p.cliente.ragione_sociale,
        cliente_piva: p.cliente.piva,
        data_scadenza: p.data_scadenza,
        stato: p.stato,
        agente: p.agente_assegnato ? `${p.agente_assegnato.nome} ${p.agente_assegnato.cognome}` : null,
        pricing_grenke: Number(p.pricing_grenke),
        pricing_riacquisto: Number(p.pricing_riacquisto),
        decisione: p.decisioni[0]?.opzione_scelta || null,
        giorni_a_scadenza,
        origine: p.origine,
        agenzia: p.agenzia,
        // Nota: in elenco serve solo sapere che c'e' (colora l'occhio) e poterla
        // leggere passandoci sopra. Il testo intero sta nella scheda.
        ha_note: Boolean(p.note && p.note.trim()),
        note_anteprima: p.note ? p.note.trim().slice(0, 200) : null,
      };
    });

    res.json({ items, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('[pratiche-avanzate] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche-avanzate/export-csv
router.get('/pratiche-avanzate/export-csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { stato, agente_id, data_scadenza_from, data_scadenza_to, origine, agenzia, cliente } = req.query as Record<string, string>;

    const where: any = { stato: { not: 'FLEX_ATTIVO' }, ambiente: ambienteVista(req) };
    if (stato) where.stato = stato;
    if (agente_id) where.agente_assegnato_id = agente_id;
    if (origine) where.origine = origine;
    // L'agenzia sulla pratica e' testo libero dell'export NSM: si filtra su
    // tutte le grafie che corrispondono, non sulla sola stringa scelta.
    if (agenzia) where.agenzia = { in: await grafieAgenzia(req, agenzia) };
    // Ricerca per nome cliente: parziale e senza distinzione fra maiuscole e
    // minuscole, perche' nessuno ricorda la ragione sociale per intero.
    if (cliente && cliente.trim()) {
      where.cliente = { ragione_sociale: { contains: cliente.trim(), mode: 'insensitive' } };
    }
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
      const scad = p.data_scadenza ? p.data_scadenza.toISOString().split('T')[0] : '';
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
    const giorni_a_scadenza = pratica.data_scadenza ? diffDays(pratica.data_scadenza, now) : null;

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

    const codiceSconto = await getCodicePerContratto(pratica.id);

    // Proposta di nuovo noleggio: serve sapere se il cliente arriva da
    // Italiaonline (il riconoscimento e' tollerante, non un confronto esatto:
    // vedi lib/origine.ts) e se gliela abbiamo gia' mandata.
    const dicitureIol = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
      .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);
    const propostaInviata = await prisma.comunicazione.findFirst({
      where: {
        tipo: TIPO_PROPOSTA_NOLEGGIO,
        esito_invio: 'INVIATO',
        contratto_eol: { cliente_id: pratica.cliente_id },
      },
      select: { data_invio: true },
      orderBy: { data_invio: 'desc' },
    });

    res.json({
      ...pratica,
      cliente_iol: origineCorrisponde(pratica.origine, dicitureIol),
      invito_pagamento_inviato: pratica.comunicazioni
        .filter(c => c.tipo === 'INVITO_PAGAMENTO' && c.esito_invio === 'INVIATO')
        .sort((a, b) => b.data_invio.getTime() - a.data_invio.getTime())[0]?.data_invio ?? null,
      proposta_noleggio_inviata: propostaInviata?.data_invio ?? null,
      canone_mensile: Number(pratica.canone_mensile),
      monte_canoni: Number(pratica.monte_canoni),
      pricing_riacquisto: Number(pratica.pricing_riacquisto),
      pricing_grenke: Number(pratica.pricing_grenke),
      margine_lordo: Number(pratica.margine_lordo),
      valore_gift_card: Number(pratica.valore_gift_card),
      valore_originario: pratica.valore_originario ? Number(pratica.valore_originario) : null,
      giorni_a_scadenza,
      timeline,
      codice_sconto: codiceSconto
        ? {
            id: codiceSconto.id,
            codice: codiceSconto.codice,
            valore_eur: Number(codiceSconto.valore_eur),
            stato: codiceSconto.stato,
            data_generazione: codiceSconto.data_generazione,
            data_scadenza: codiceSconto.data_scadenza,
            data_utilizzo: codiceSconto.data_utilizzo,
            note: codiceSconto.note,
          }
        : null,
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

// POST /api/backoffice/pratiche-dettaglio/:id/modifica-contatti — corregge
// email e/o PEC del cliente. I contatti sono del Cliente, quindi la modifica
// vale per tutte le sue pratiche. La PEC può essere svuotata, l'email no.
router.post('/pratiche-dettaglio/:id/modifica-contatti', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, pec } = req.body as { email?: string; pec?: string };
    if (email === undefined && pec === undefined) {
      res.status(400).json({ error: 'Indicare almeno un contatto da modificare' });
      return;
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const nuovaEmail = email !== undefined ? String(email).trim().toLowerCase() : undefined;
    const nuovaPec = pec !== undefined ? String(pec).trim().toLowerCase() : undefined;
    if (nuovaEmail !== undefined && !EMAIL_RE.test(nuovaEmail)) {
      res.status(400).json({ error: 'Indirizzo email non valido' });
      return;
    }
    if (nuovaPec !== undefined && nuovaPec !== '' && !EMAIL_RE.test(nuovaPec)) {
      res.status(400).json({ error: 'Indirizzo PEC non valido' });
      return;
    }

    const pratica = await prisma.contratto_EOL.findUnique({
      where: { id: req.params.id as string },
      select: { cliente_id: true, cliente: { select: { email: true, pec: true } } },
    });
    if (!pratica) {
      res.status(404).json({ error: 'Pratica non trovata' });
      return;
    }

    const data: { email?: string; pec?: string | null } = {};
    if (nuovaEmail !== undefined) data.email = nuovaEmail;
    if (nuovaPec !== undefined) data.pec = nuovaPec === '' ? null : nuovaPec;
    await prisma.cliente.update({ where: { id: pratica.cliente_id }, data });

    await registraEvento(
      req.params.id as string,
      'BACKOFFICE',
      (req.user as any)?.id || 'system',
      'MODIFICA_BACKOFFICE',
      {
        sotto_azione: 'MODIFICA_CONTATTI',
        email_precedente: pratica.cliente.email,
        email_nuova: data.email ?? pratica.cliente.email,
        pec_precedente: pratica.cliente.pec,
        pec_nuova: data.pec === undefined ? pratica.cliente.pec : data.pec,
      },
    );

    res.json({ success: true, messaggio: 'Contatti del cliente aggiornati' });
  } catch (err) {
    console.error('[modifica-contatti] Errore:', err);
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

// POST /api/backoffice/pratiche-dettaglio/:id/proposta-noleggio — manda a
// questo cliente la proposta di nuovo noleggio.
//
// Stessa mail della campagna massiva, mandata una pratica per volta: serve
// quando un cliente lo chiede al telefono e non ha senso aspettare un invio di
// gruppo. Non filtra per origine, a differenza della campagna: qui l'operatore
// ha davanti il cliente e decide lui. La regola "una sola per cliente" resta,
// ed e' il servizio a farla rispettare.
router.post('/pratiche-dettaglio/:id/proposta-noleggio', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const operatoreId = (req.user as any)?.id as string | undefined;
    const r = await inviaPropostaNuovoNoleggio(req.params.id as string, operatoreId);

    if (!r.success) {
      res.status(400).json({ error: r.errori.join('; ') || 'Invio non riuscito' });
      return;
    }

    res.json({ success: true, messaggio: 'Proposta di nuovo noleggio inviata' });
  } catch (err) {
    console.error('[proposta-noleggio singola] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche-dettaglio/:id/link-pagamento — il link da dare
// al cliente a voce o per messaggio, senza passare per la mail.
//
// E' lo stesso della mail di invito: al telefono non si detta un indirizzo
// diverso da quello che il cliente ha in casella.
router.get('/pratiche-dettaglio/:id/link-pagamento', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }
    const { linkPagamentoPratica } = await import('../services/scheduler.service.js');
    const esito = await linkPagamentoPratica(req.params.id as string);
    if (!esito.ok) { res.status(400).json({ error: esito.errore }); return; }
    res.json({ link: esito.link, scade: esito.scade });
  } catch (err) {
    console.error('[link-pagamento] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/invito-pagamento
//
// Anticipa l'invito al pagamento che lo scheduler manderebbe al T-26, su
// richiesta dell'operatore. Vale anche sulle pratiche LIVE: li' sta chiedendo
// dei soldi a un'azienda vera, quindi resta riservato a chi gestisce il
// backoffice e la conferma a video lo dice a chiare lettere.
router.post('/pratiche-dettaglio/:id/invito-pagamento', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const { promemoria } = req.body as { promemoria?: unknown };
    const { inviaRichiestaPagamento } = await import('../services/scheduler.service.js');
    const esito = await inviaRichiestaPagamento(req.params.id as string, {
      promemoria: promemoria === true,
      operatoreId: (req.user as any)?.id,
    });

    if (!esito.ok) { res.status(400).json({ error: esito.errore }); return; }

    const che = promemoria === true ? 'Promemoria di pagamento inviato' : 'Richiesta di pagamento inviata';
    res.json({
      success: true,
      messaggio: esito.ambiente === 'TEST' ? `${che} (ambiente TEST: resta in casa)` : `${che} al cliente`,
    });
  } catch (err) {
    console.error('[invito-pagamento] Errore:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/note — appunti del backoffice.
//
// Campo unico, sovrascritto: chi scrive si aspetta di ritrovare cio' che ha
// lasciato, non un diario che cresce da solo. La versione precedente finisce
// nell'audit, quindi nulla va perso davvero.
router.post('/pratiche-dettaglio/:id/note', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { note } = req.body as { note?: unknown };
    const id = req.params.id as string;

    const c = await prisma.contratto_EOL.findUnique({ where: { id }, select: { note: true } });
    if (!c) { res.status(404).json({ error: 'Pratica non trovata' }); return; }

    const testo = typeof note === 'string' ? note.trim() : '';
    if (testo.length > 5000) {
      res.status(400).json({ error: 'Nota troppo lunga (massimo 5000 caratteri)' });
      return;
    }
    const nuovo = testo || null;

    if (nuovo === c.note) {
      res.json({ success: true, note: nuovo, invariata: true });
      return;
    }

    await prisma.contratto_EOL.update({ where: { id }, data: { note: nuovo } });

    await registraEvento(id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MODIFICA_BACKOFFICE', {
      sotto_azione: nuovo ? 'NOTE_AGGIORNATE' : 'NOTE_CANCELLATE',
      note_precedenti: c.note,
      note: nuovo,
    });

    res.json({ success: true, note: nuovo });
  } catch (err) {
    console.error('[note] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/rete-commerciale — agenzia e
// agente come li riporta l'export NSM (colonne A e B), correggibili a mano.
//
// Sono etichette descrittive: non spostano task ne' notifiche, che restano
// legate ad agente_assegnato_id. Campo vuoto = valore cancellato, non "lascia
// com'era": serve a togliere un dato sbagliato arrivato dal file.
router.post('/pratiche-dettaglio/:id/rete-commerciale', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const { agenzia, agente } = req.body as { agenzia?: unknown; agente?: unknown };
    const pulisci = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      return t === '' ? null : t.slice(0, 200);
    };

    const id = req.params.id as string;
    const c = await prisma.contratto_EOL.findUnique({
      where: { id },
      select: { agenzia: true, agente: true },
    });
    if (!c) { res.status(404).json({ error: 'Pratica non trovata' }); return; }

    const nuovaAgenzia = pulisci(agenzia);
    const nuovoAgente = pulisci(agente);

    await prisma.contratto_EOL.update({
      where: { id },
      data: { agenzia: nuovaAgenzia, agente: nuovoAgente },
    });

    await registraEvento(id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MODIFICA_BACKOFFICE', {
      sotto_azione: 'RETE_COMMERCIALE',
      agenzia_precedente: c.agenzia,
      agente_precedente: c.agente,
      agenzia: nuovaAgenzia,
      agente: nuovoAgente,
    });

    res.json({ success: true, agenzia: nuovaAgenzia, agente: nuovoAgente });
  } catch (err) {
    console.error('[rete-commerciale] Errore:', err);
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

    // Anche per le decisioni manuali RINNOVO il cliente ha diritto allo Sconto
    // Copertura Bronze: genera il codice (idempotente, errore non bloccante)
    if (decisione === 'RINNOVO') {
      try {
        await generaCodice(req.params.id as string);
      } catch (err) {
        console.error('[decisione-manuale] Generazione codice sconto fallita:', err);
      }
    }

    res.json({ success: true, messaggio: `Decisione ${decisione} registrata manualmente` });
  } catch (err) {
    console.error('[decisione-manuale] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/reinvia-comunicazione
router.post('/pratiche-dettaglio/:id/reinvia-comunicazione', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const canaleBody = (req.body as { canale?: string } | undefined)?.canale;
    const canale = canaleBody === 'EMAIL' || canaleBody === 'PEC' ? canaleBody : 'TUTTI';
    const result = await inviaComunicazioneIniziale(req.params.id as string, { reinvio: true, canale });
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

// GET /api/backoffice/origini — le origini realmente presenti a DB.
// Il menu del filtro era cablato su ['Smartcom','IOL'], i codici dei dati di
// prova: sui dati veri `origine` riporta il "broker name" del file Grenke
// ("Italiaonline S.p.A", "Smartcom Solutions S.r.l."), quindi il filtro non
// selezionava nulla — senza errori, solo risultati vuoti. Leggendole dal DB
// il menu resta corretto qualunque dicitura usi Grenke.
// GET /api/backoffice/agenzie-pratiche — agenzie effettivamente presenti sulle
// pratiche, per il filtro della lista.
//
// Raggruppate per nome normalizzato: "Italiaonline" e "ItaliaOnline" arrivano
// dallo stesso export in due grafie, e come due voci separate nel menu a
// tendina sarebbero solo confusione.
router.get('/agenzie-pratiche', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const righe = await prisma.contratto_EOL.findMany({
      where: { ambiente: ambienteVista(req) },
      select: { agenzia: true },
      distinct: ['agenzia'],
      orderBy: { agenzia: 'asc' },
    });
    const perChiave = new Map<string, string>();
    for (const r of righe) {
      const nome = (r.agenzia ?? '').trim();
      if (!nome) continue;
      const k = normalizzaOrigine(nome);
      if (!perChiave.has(k)) perChiave.set(k, nome);
    }
    res.json([...perChiave.values()].sort((a, b) => a.localeCompare(b, 'it')));
  } catch (err) {
    console.error('[agenzie-pratiche] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/origini', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const righe = await prisma.contratto_EOL.findMany({
      where: { ambiente: ambienteVista(req) },
      select: { origine: true },
      distinct: ['origine'],
      orderBy: { origine: 'asc' },
    });
    res.json(righe.map(r => r.origine).filter((o): o is string => Boolean(o && o.trim())));
  } catch (err) {
    console.error('[origini] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/pratiche-dettaglio/:id/beni-riacquisto — elenco dei beni
// con lo stato di inclusione, per la modale del backoffice.
router.get('/pratiche-dettaglio/:id/beni-riacquisto', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const c = await prisma.contratto_EOL.findUnique({ where: { id: req.params.id as string } });
    if (!c) { res.status(404).json({ error: 'Pratica non trovata' }); return; }
    const esclusi = new Set(parseEsclusi(c.beni_esclusi_json));
    res.json({
      beni: parseBeni(c.beni_json).map((b, i) => ({
        indice: i,
        descrizione: formatBene(b),
        seriale: b.seriale ?? null,
        canone_unitario: (b as any).canone_unitario ?? null,
        incluso: !esclusi.has(i),
      })),
      pricing_riacquisto: Number(c.pricing_riacquisto),
      pricing_riacquisto_pieno: c.pricing_riacquisto_pieno != null ? Number(c.pricing_riacquisto_pieno) : Number(c.pricing_riacquisto),
      pricing_grenke: Number(c.pricing_grenke),
      parziale: esclusi.size > 0,
      modificabile: c.stato !== 'RIACQUISTO_PAGATO',
    });
  } catch (err) {
    console.error('[beni-riacquisto/get] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/beni-riacquisto — concessione di
// riacquisto parziale: il backoffice esclude dei dispositivi e fissa il prezzo
// al cliente. Verso Grenke l'acquisto resta integrale, quindi pricing_grenke
// non viene mai toccato e il margine si riduce di conseguenza (puo' andare
// sotto zero: e' una scelta commerciale, non un errore da bloccare).
router.post('/pratiche-dettaglio/:id/beni-riacquisto', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const { esclusi, pricing_riacquisto } = req.body as { esclusi?: unknown; pricing_riacquisto?: unknown };
    const id = req.params.id as string;

    const c = await prisma.contratto_EOL.findUnique({ where: { id } });
    if (!c) { res.status(404).json({ error: 'Pratica non trovata' }); return; }
    if (c.stato === 'RIACQUISTO_PAGATO') {
      res.status(409).json({ error: 'Pratica gia\' pagata: i beni non sono piu\' modificabili' });
      return;
    }

    const beni = parseBeni(c.beni_json);
    if (beni.length === 0) { res.status(400).json({ error: 'La pratica non ha beni censiti' }); return; }

    const lista = Array.isArray(esclusi) ? esclusi : [];
    const indici = [...new Set(lista.filter((n): n is number => Number.isInteger(n)))];
    if (indici.some(i => i < 0 || i >= beni.length)) {
      res.status(400).json({ error: 'Indice di bene non valido' });
      return;
    }
    if (indici.length >= beni.length) {
      res.status(400).json({ error: 'Non si possono escludere tutti i beni: sarebbe una restituzione, non un riacquisto' });
      return;
    }

    const prezzo = Number(pricing_riacquisto);
    if (!Number.isFinite(prezzo) || prezzo < 0) {
      res.status(400).json({ error: 'Prezzo al cliente non valido' });
      return;
    }

    // Il prezzo pieno si fissa alla prima esclusione e non cambia piu': serve a
    // poter tornare al riacquisto totale con l'importo originale.
    const pieno = c.pricing_riacquisto_pieno != null ? Number(c.pricing_riacquisto_pieno) : Number(c.pricing_riacquisto);
    const parziale = indici.length > 0;
    const nuovoPrezzo = parziale ? prezzo : pieno;
    const margine = Number((nuovoPrezzo - Number(c.pricing_grenke)).toFixed(2));

    const aggiornato = await prisma.contratto_EOL.update({
      where: { id },
      data: {
        beni_esclusi_json: parziale ? JSON.stringify(indici.sort((a, b) => a - b)) : null,
        pricing_riacquisto: new Prisma.Decimal(nuovoPrezzo.toFixed(2)),
        pricing_riacquisto_pieno: new Prisma.Decimal(pieno.toFixed(2)),
        margine_lordo: new Prisma.Decimal(margine.toFixed(2)),
        valore_gift_card: new Prisma.Decimal((await calcolaValoreGiftCard(margine)).toFixed(2)),
      },
    });

    await registraEvento(id, 'BACKOFFICE', (req.user as any)?.id || 'system',
      parziale ? 'RIACQUISTO_PARZIALE_IMPOSTATO' : 'RIACQUISTO_PARZIALE_ANNULLATO', {
        beni_esclusi: beniEsclusi(c.beni_json, aggiornato.beni_esclusi_json).map(formatBene),
        beni_inclusi: beniInclusi(c.beni_json, aggiornato.beni_esclusi_json).map(formatBene),
        pricing_riacquisto_precedente: Number(c.pricing_riacquisto),
        pricing_riacquisto: nuovoPrezzo,
        pricing_riacquisto_pieno: pieno,
        pricing_grenke: Number(c.pricing_grenke),
        margine_lordo: margine,
      });

    res.json({
      success: true,
      parziale,
      pricing_riacquisto: nuovoPrezzo,
      margine_lordo: margine,
      beni_esclusi: beniEsclusi(c.beni_json, aggiornato.beni_esclusi_json).map(formatBene),
    });
  } catch (err) {
    console.error('[beni-riacquisto/post] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/link-onboarding — link di registrazione a un nuovo
// noleggio, da passare a un cliente.
//
// Letto dalle Impostazioni (iol.link_nuovo_noleggio), non cablato nel
// frontend: contiene l'identificativo dell'agente, e il giorno che cambia deve
// bastare modificarlo da pannello. Aperto a tutti i ruoli di backoffice: e' un
// link commerciale, non un dato riservato.
router.get('/link-onboarding', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const link = await configService.getTesto('iol.link_nuovo_noleggio', '');
    res.json({ link: link || null });
  } catch (err) {
    console.error('[link-onboarding] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── PROPOSTA DI NUOVO NOLEGGIO ────────────────────────────────────────────
//
// Campagna commerciale separata dal fine contratto (vedi email.service.ts).
// Parte a mano: un invio a clienti veri va guardato mentre succede, non
// affidato allo scheduler.

/** Destinatari candidati: un cliente per riga, gia' spogliato di chi non deve ricevere. */
async function destinatariProposta(req: AuthenticatedRequest) {
  const diciture = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
    .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);

  const pratiche = await prisma.contratto_EOL.findMany({
    where: { ambiente: ambienteVista(req) },
    select: {
      id: true, origine: true, contratto_grenke_id: true, data_scadenza: true, stato: true,
      cliente_id: true,
      cliente: { select: { ragione_sociale: true, email: true, opt_out_comunicazioni: true } },
      decisioni: { select: { id: true } },
    },
    orderBy: { data_scadenza: 'asc' },
  });

  const gia = new Set(
    (await prisma.comunicazione.findMany({
      where: { tipo: TIPO_PROPOSTA_NOLEGGIO, esito_invio: 'INVIATO' },
      select: { contratto_eol: { select: { cliente_id: true } } },
    })).map(c => c.contratto_eol.cliente_id),
  );

  // Una riga per cliente: la prima pratica in scadenza fa da riferimento.
  const perCliente = new Map<string, any>();
  for (const p of pratiche) {
    if (!origineCorrisponde(p.origine, diciture)) continue;
    if (perCliente.has(p.cliente_id)) continue;
    perCliente.set(p.cliente_id, {
      contratto_eol_id: p.id,
      cliente_id: p.cliente_id,
      ragione_sociale: p.cliente.ragione_sociale,
      email: p.cliente.email,
      origine: p.origine,
      contratto_grenke_id: p.contratto_grenke_id,
      data_scadenza: p.data_scadenza,
      stato: p.stato,
      ha_deciso: p.decisioni.length > 0,
      gia_inviata: gia.has(p.cliente_id),
      opt_out: p.cliente.opt_out_comunicazioni,
      senza_email: !p.cliente.email,
    });
  }
  return [...perCliente.values()];
}

// GET /api/backoffice/proposta-noleggio/destinatari — anteprima, non invia nulla
router.get('/proposta-noleggio/destinatari', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }
    const righe = await destinatariProposta(req);
    res.json({
      ambiente: ambienteVista(req),
      totale: righe.length,
      inviabili: righe.filter(r => !r.gia_inviata && !r.opt_out && !r.senza_email).length,
      destinatari: righe,
    });
  } catch (err) {
    console.error('[proposta-noleggio/destinatari] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/proposta-noleggio/invia — invio, solo agli id indicati
router.post('/proposta-noleggio/invia', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    // Nessun invio "a tutti" implicito: il frontend manda la lista che
    // l'operatore ha davanti, cosi' non puo' partire piu' di quanto ha visto.
    const { contratti } = req.body as { contratti?: unknown };
    const ids = Array.isArray(contratti) ? contratti.filter((x): x is string => typeof x === 'string') : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'Nessun destinatario selezionato' });
      return;
    }

    const ammessi = new Set((await destinatariProposta(req)).map(r => r.contratto_eol_id));
    // Niente fallback 'system': operatore_id e' una FK su Utente_NSM, e una
    // stringa inventata farebbe fallire la registrazione della Comunicazione
    // dopo che la mail e' gia' partita.
    const operatoreId = (req.user as any)?.id as string | undefined;

    let inviate = 0; const saltate: string[] = []; const errori: string[] = [];
    for (const id of ids) {
      if (!ammessi.has(id)) { saltate.push(`${id}: non fra i destinatari ammessi`); continue; }
      const r = await inviaPropostaNuovoNoleggio(id, operatoreId);
      if (r.success) inviate++;
      else if (r.errori.some(e => e.includes('gia\' inviata') || e.includes('opt-out'))) saltate.push(r.errori.join('; '));
      else errori.push(r.errori.join('; '));
    }

    res.json({
      success: true,
      messaggio: `${inviate} inviate, ${saltate.length} saltate, ${errori.length} errori`,
      inviate, saltate, errori,
    });
  } catch (err) {
    console.error('[proposta-noleggio/invia] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/prezzo-riacquisto — prezzo su
// misura per un singolo cliente, in deroga alle mensilita' configurate.
//
// E' ammesso solo finche' la comunicazione iniziale non e' partita: da quel
// momento il cliente ha visto un importo, e cambiarlo sotto banco sarebbe
// scorretto. Dopo l'invio resta la strada del riacquisto parziale, che il
// cliente vede motivata dai beni esclusi. Verso Grenke non cambia nulla:
// pricing_grenke resta quello del file, il margine si adegua.
router.post('/pratiche-dettaglio/:id/prezzo-riacquisto', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const { pricing_riacquisto, motivazione } = req.body as { pricing_riacquisto?: unknown; motivazione?: string };
    const id = req.params.id as string;

    const c = await prisma.contratto_EOL.findUnique({ where: { id } });
    if (!c) { res.status(404).json({ error: 'Pratica non trovata' }); return; }

    if (c.stato !== 'LISTA_RICEVUTA') {
      res.status(409).json({
        error: 'La comunicazione al cliente e\' gia\' partita: il prezzo non e\' piu\' modificabile. Per una concessione usa "Beni del riacquisto".',
      });
      return;
    }
    if (parseEsclusi(c.beni_esclusi_json).length > 0) {
      res.status(409).json({ error: 'Pratica con riacquisto parziale attivo: il prezzo si imposta da "Beni del riacquisto"' });
      return;
    }

    const prezzo = Number(pricing_riacquisto);
    if (!Number.isFinite(prezzo) || prezzo <= 0) {
      res.status(400).json({ error: 'Prezzo al cliente non valido' });
      return;
    }
    if (!motivazione || !motivazione.trim()) {
      res.status(400).json({ error: 'Motivazione obbligatoria' });
      return;
    }

    const margine = Number((prezzo - Number(c.pricing_grenke)).toFixed(2));

    await prisma.contratto_EOL.update({
      where: { id },
      data: {
        pricing_riacquisto: new Prisma.Decimal(prezzo.toFixed(2)),
        // Il prezzo pieno segue: e' il riferimento a cui si torna annullando
        // un'eventuale esclusione di beni piu' avanti.
        pricing_riacquisto_pieno: new Prisma.Decimal(prezzo.toFixed(2)),
        margine_lordo: new Prisma.Decimal(margine.toFixed(2)),
        valore_gift_card: new Prisma.Decimal((await calcolaValoreGiftCard(margine)).toFixed(2)),
      },
    });

    await registraEvento(id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MODIFICA_BACKOFFICE', {
      sotto_azione: 'PREZZO_RIACQUISTO_PERSONALIZZATO',
      pricing_riacquisto_precedente: Number(c.pricing_riacquisto),
      pricing_riacquisto: prezzo,
      pricing_grenke: Number(c.pricing_grenke),
      margine_lordo: margine,
      motivazione: motivazione.trim(),
    });

    res.json({ success: true, pricing_riacquisto: prezzo, margine_lordo: margine });
  } catch (err) {
    console.error('[prezzo-riacquisto] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/pratiche-dettaglio/:id/registra-pagamento — il backoffice
// ha verificato l'accredito del bonifico e registra il pagamento del riacquisto:
// pratica → RIACQUISTO_PAGATO, ricevuta generata e inviata al cliente.
router.post('/pratiche-dettaglio/:id/registra-pagamento', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }

    const { riferimento } = req.body as { riferimento?: string };
    const contrattoId = req.params.id as string;

    const result = await confermaBonificoRicevuto(contrattoId, (req.user as any)?.id || 'system', riferimento);

    // Ricevuta al cliente: stessa funzione usata dal webhook dei pagamenti
    // online, cosi' bonifico e carta producono la stessa email.
    const { inviaRicevutaAlCliente } = await import('../services/payment.service.js');
    const email_inviata = await inviaRicevutaAlCliente(
      contrattoId,
      result.fattura_numero,
      result.fattura_path,
      (req.user as any)?.id || undefined,
    );

    res.json({
      success: true,
      messaggio: 'Pagamento registrato, pratica in stato RIACQUISTO_PAGATO',
      pagamento_id: result.pagamento_id,
      fattura_numero: result.fattura_numero,
      email_inviata,
    });
  } catch (err) {
    console.error('[registra-pagamento] Errore:', err);
    const msg = err instanceof Error ? err.message : 'Errore interno';
    res.status(msg === 'Pratica già pagata' ? 409 : 500).json({ error: msg });
  }
});

// ─── SEGNALAZIONI CASELLA INFO@ (monitor IMAP) ─────────────────────────────

// GET /api/backoffice/segnalazioni-casella — lista con filtri e paginazione
router.get('/segnalazioni-casella', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, keyword, data_from, data_to, page = '1', pageSize = '25' } = req.query as Record<string, string>;
    // Le segnalazioni eliminate restano a DB solo per la deduplicazione
    // (altrimenti il monitor le ricreerebbe al giro successivo) ma non
    // compaiono mai in elenco né nei conteggi.
    const where: any = { status: status || { in: ['NEW', 'NOTIFIED', 'HANDLED'] } };
    if (keyword) where.matched_keywords = { contains: keyword, mode: 'insensitive' };
    if (data_from || data_to) {
      where.received_at = {};
      if (data_from) where.received_at.gte = new Date(data_from);
      if (data_to) { const t = new Date(data_to); t.setHours(23, 59, 59, 999); where.received_at.lte = t; }
    }
    const skip = (Number(page) - 1) * Number(pageSize);
    const [total, righe, daGestire] = await Promise.all([
      prisma.monitoredEmail.count({ where }),
      prisma.monitoredEmail.findMany({
        where,
        include: { contratto_eol: { select: { id: true, contratto_nsm_id: true, data_scadenza: true } } },
        orderBy: { received_at: 'desc' },
        skip,
        take: Number(pageSize),
      }),
      prisma.monitoredEmail.count({ where: { status: { in: ['NEW', 'NOTIFIED'] } } }),
    ]);
    res.json({
      items: righe.map(m => ({
        id: m.id,
        received_at: m.received_at,
        from_address: m.from_address,
        from_name: m.from_name,
        subject: m.subject,
        snippet: m.snippet,
        keywords: JSON.parse(m.matched_keywords),
        status: m.status,
        casella: m.casella,
        contratto: m.contratto_eol
          ? { id: m.contratto_eol.id, contratto_nsm: m.contratto_eol.contratto_nsm_id, data_scadenza: m.contratto_eol.data_scadenza }
          : null,
      })),
      total,
      da_gestire: daGestire,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  } catch (err) {
    console.error('[segnalazioni-casella] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/segnalazioni-casella/:id/corpo — testo completo della mail
//
// Fino al 18/09/2026 salvavamo solo i primi 300 caratteri, e le risposte dei
// clienti restavano tagliate a meta' frase. Ora il corpo si salva all'arrivo;
// per le segnalazioni piu' vecchie si ripesca dalla casella alla prima
// apertura e da li' in poi resta a database.
router.get('/segnalazioni-casella/:id/corpo', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const m = await prisma.monitoredEmail.findUnique({ where: { id: req.params.id as string } });
    if (!m) { res.status(404).json({ error: 'Segnalazione non trovata' }); return; }

    if (m.corpo_testo) {
      res.json({ corpo: m.corpo_testo, origine: 'archivio' });
      return;
    }

    const { scaricaCorpo } = await import('../services/mail-monitor.service.js');
    const corpo = await scaricaCorpo(m.casella, m.imap_uid);

    if (!corpo) {
      // Nessun testo da mostrare: meglio dirlo che lasciare un riquadro vuoto.
      res.json({
        corpo: null,
        origine: 'non_recuperabile',
        messaggio: 'Il testo completo non e\' piu\' recuperabile dalla casella (la mail potrebbe essere stata spostata o cancellata). Resta disponibile l\'anteprima.',
        snippet: m.snippet,
      });
      return;
    }

    await prisma.monitoredEmail.update({
      where: { id: m.id },
      data: { corpo_testo: corpo.slice(0, 100_000) },
    });

    res.json({ corpo: corpo.slice(0, 100_000), origine: 'casella' });
  } catch (err) {
    console.error('[segnalazioni-casella/corpo] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/segnalazioni-casella/:id/gestita — status → HANDLED (audit)
router.post('/segnalazioni-casella/:id/gestita', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const m = await prisma.monitoredEmail.findUnique({ where: { id: req.params.id as string } });
    if (!m) {
      res.status(404).json({ error: 'Segnalazione non trovata' });
      return;
    }
    await prisma.monitoredEmail.update({ where: { id: m.id }, data: { status: 'HANDLED' } });
    await registraEvento(m.contratto_eol_id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MONITOR_SEGNALAZIONE_GESTITA', {
      segnalazione_id: m.id,
      mittente: m.from_address,
      oggetto: m.subject,
      status_precedente: m.status,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[segnalazioni-casella/gestita] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/segnalazioni-casella/elimina — eliminazione di piu'
// segnalazioni in un colpo solo.
//
// Sta PRIMA della rotta con :id per leggibilita', anche se i due percorsi non
// si sovrappongono (uno ha un segmento in piu'). Come per la singola, la riga
// resta a DB con status ELIMINATA: serve alla deduplicazione, altrimenti il
// monitor ricreerebbe la segnalazione al giro successivo. La mail nella
// casella non viene mai toccata.
router.post('/segnalazioni-casella/elimina', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids?: unknown };
    const lista = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
    if (lista.length === 0) {
      res.status(400).json({ error: 'Nessuna segnalazione selezionata' });
      return;
    }

    const righe = await prisma.monitoredEmail.findMany({
      where: { id: { in: lista }, status: { not: 'ELIMINATA' } },
    });

    await prisma.monitoredEmail.updateMany({
      where: { id: { in: righe.map(r => r.id) } },
      data: { status: 'ELIMINATA' },
    });

    // Un evento per segnalazione, non uno cumulativo: l'audit e' per pratica e
    // ognuna puo' essere legata a un contratto diverso.
    for (const m of righe) {
      await registraEvento(m.contratto_eol_id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MONITOR_SEGNALAZIONE_ELIMINATA', {
        segnalazione_id: m.id,
        mittente: m.from_address,
        oggetto: m.subject,
        status_precedente: m.status,
        in_blocco: true,
      });
    }

    res.json({
      success: true,
      eliminate: righe.length,
      gia_eliminate: lista.length - righe.length,
    });
  } catch (err) {
    console.error('[segnalazioni-casella/elimina-multiple] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/segnalazioni-casella/:id/elimina — la segnalazione
// sparisce da elenco/conteggi/digest; la riga resta a DB per la deduplicazione.
router.post('/segnalazioni-casella/:id/elimina', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const m = await prisma.monitoredEmail.findUnique({ where: { id: req.params.id as string } });
    if (!m) {
      res.status(404).json({ error: 'Segnalazione non trovata' });
      return;
    }
    await prisma.monitoredEmail.update({ where: { id: m.id }, data: { status: 'ELIMINATA' } });
    await registraEvento(m.contratto_eol_id, 'BACKOFFICE', (req.user as any)?.id || 'system', 'MONITOR_SEGNALAZIONE_ELIMINATA', {
      segnalazione_id: m.id,
      mittente: m.from_address,
      oggetto: m.subject,
      status_precedente: m.status,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[segnalazioni-casella/elimina] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// POST /api/backoffice/segnalazioni-casella/test-connessione — verifica credenziali IMAP
router.post('/segnalazioni-casella/test-connessione', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ruolo = (req.user as any)?.ruolo;
    if (!['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo)) {
      res.status(403).json({ error: 'Operazione riservata a Backoffice interno e Admin' });
      return;
    }
    const { testConnessione } = await import('../services/mail-monitor.service.js');
    const esito = await testConnessione();
    res.json(esito);
  } catch (err) {
    console.error('[test-connessione] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// ─── REGISTRO COMUNICAZIONI INVIATE (Posta/PEC) ────────────────────────────

// GET /api/backoffice/comunicazioni — registro di tutto ciò che è stato spedito
router.get('/comunicazioni', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { canale, tipo, esito, search, data_from, data_to, page = '1', pageSize = '25' } = req.query as Record<string, string>;
    const where: any = {
      contratto_eol: { ambiente: ambienteVista(req) },
      canale: canale === 'PEC' ? 'PEC' : canale === 'EMAIL' ? 'EMAIL' : { in: ['EMAIL', 'PEC'] },
    };
    if (tipo) where.tipo = tipo;
    if (esito) where.esito_invio = esito;
    if (data_from || data_to) {
      where.data_invio = {};
      if (data_from) where.data_invio.gte = new Date(data_from);
      if (data_to) { const t = new Date(data_to); t.setHours(23, 59, 59, 999); where.data_invio.lte = t; }
    }
    if (search) {
      where.OR = [
        { destinatario: { contains: search, mode: 'insensitive' } },
        { oggetto: { contains: search, mode: 'insensitive' } },
        { contratto_eol: { contratto_nsm_id: { contains: search, mode: 'insensitive' } } },
        { contratto_eol: { cliente: { ragione_sociale: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const [total, righe, tipiRaw] = await Promise.all([
      prisma.comunicazione.count({ where }),
      prisma.comunicazione.findMany({
        where,
        include: {
          contratto_eol: { select: { id: true, contratto_nsm_id: true, cliente: { select: { ragione_sociale: true } } } },
        },
        orderBy: { data_invio: 'desc' },
        skip,
        take: Number(pageSize),
      }),
      prisma.comunicazione.groupBy({
        by: ['tipo'],
        where: { contratto_eol: { ambiente: ambienteVista(req) }, canale: { in: ['EMAIL', 'PEC'] } },
      }),
    ]);

    res.json({
      items: righe.map(c => ({
        id: c.id,
        data_invio: c.data_invio,
        tipo: c.tipo,
        canale: c.canale,
        destinatario: c.destinatario,
        oggetto: c.oggetto,
        esito: c.esito_invio,
        allegati: c.allegati_json ? JSON.parse(c.allegati_json) : [],
        contratto_id: c.contratto_eol.id,
        contratto_nsm: c.contratto_eol.contratto_nsm_id,
        cliente: c.contratto_eol.cliente.ragione_sociale,
      })),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      tipi: tipiRaw.map(t => t.tipo).sort(),
    });
  } catch (err) {
    console.error('[comunicazioni] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/comunicazioni/:id — dettaglio con il corpo HTML esatto inviato
router.get('/comunicazioni/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const c = await prisma.comunicazione.findFirst({
      where: { id: req.params.id as string, contratto_eol: { ambiente: ambienteVista(req) } },
      include: {
        contratto_eol: { select: { id: true, contratto_nsm_id: true, cliente: { select: { ragione_sociale: true } } } },
      },
    });
    if (!c) {
      res.status(404).json({ error: 'Comunicazione non trovata' });
      return;
    }
    res.json({
      id: c.id,
      data_invio: c.data_invio,
      tipo: c.tipo,
      canale: c.canale,
      destinatario: c.destinatario,
      oggetto: c.oggetto,
      corpo_html: c.corpo_html,
      esito: c.esito_invio,
      allegati: c.allegati_json ? JSON.parse(c.allegati_json) : [],
      contratto_id: c.contratto_eol.id,
      contratto_nsm: c.contratto_eol.contratto_nsm_id,
      cliente: c.contratto_eol.cliente.ragione_sociale,
    });
  } catch (err) {
    console.error('[comunicazioni/:id] Errore:', err);
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
router.get('/outliers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const outliers = await prisma.contratto_EOL.findMany({
      where: { stato_riconciliazione: 'OUTLIER_DA_GESTIRE', ambiente: ambienteVista(req) },
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
      where: { ambiente: outlier.ambiente },
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
        ambiente: ambienteVista(req),
      },
      select: { id: true, stato: true, margine_lordo: true, data_scadenza: true },
    });

    const total = pratiche.length;
    const silenzi = pratiche.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
    const rinnovi = pratiche.filter(p => ['DECISIONE_RINNOVO', 'RINNOVO_IN_CORSO'].includes(p.stato)).length;
    const riacquisti = pratiche.filter(p => ['DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO', 'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO'].includes(p.stato)).length;
    const restituzioni = pratiche.filter(p => ['DECISIONE_RESTITUZIONE', 'RESTITUZIONE_CONFERMATA'].includes(p.stato)).length;

    const statiChiusi = ['DECISIONE_RINNOVO', 'DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO', 'DECISIONE_CONTATTO', 'DECISIONE_RESTITUZIONE',
      'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO', 'RINNOVO_IN_CORSO', 'RESTITUZIONE_CONFERMATA', 'SILENZIO_PERDITA_DEFINITIVA'];
    const chiuse = pratiche.filter(p => statiChiusi.includes(p.stato)).length;

    const months: { mese: string; tasso_non_silenzio: number; rinnovi: number; riacquisti: number; restituzioni: number; silenzi: number }[] = [];

    for (let m = start.getMonth(); m < (periodo === 'anno' ? 12 : start.getMonth() + (periodo === 'trimestre' ? 3 : 1)); m++) {
      const mStart = new Date(start.getFullYear(), m, 1);
      const mEnd = new Date(start.getFullYear(), m + 1, 1);
      const mp = pratiche.filter(p => p.data_scadenza && p.data_scadenza >= mStart && p.data_scadenza < mEnd);
      const mc = mp.filter(p => statiChiusi.includes(p.stato));
      const ms = mp.filter(p => p.stato === 'SILENZIO_PERDITA_DEFINITIVA').length;
      const tns = mc.length > 0 ? ((mc.length - ms) / mc.length) * 100 : 0;

      months.push({
        mese: mStart.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
        tasso_non_silenzio: Math.round(tns * 10) / 10,
        rinnovi: mp.filter(p => ['DECISIONE_RINNOVO', 'RINNOVO_IN_CORSO'].includes(p.stato)).length,
        riacquisti: mp.filter(p => ['DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO', 'RIACQUISTO_IN_ATTESA_CHIAMATA', 'RIACQUISTO_PAGATO'].includes(p.stato)).length,
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
        ambiente: ambienteVista(req),
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
        ambiente: ambienteVista(req),
      },
      select: { agente_assegnato_id: true, stato: true, margine_lordo: true },
    });

    const statiChiusi = ['DECISIONE_RINNOVO', 'DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO', 'DECISIONE_CONTATTO', 'DECISIONE_RESTITUZIONE',
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
    const rows = await previewExport(da, a, ambienteVista(req));
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
    const result = await generaExcel(da, a, esclusi || [], operatoreId, ambienteVista(req));
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[grenke-export/genera] Errore: ${msg}`);
    res.status(500).json({ error: `Generazione del file fallita: ${msg}` });
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
