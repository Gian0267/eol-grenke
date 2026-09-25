import { Router, Response } from 'express';
import { AuthenticatedRequest, ambienteVista, verifyBackofficeToken } from '../middleware/auth.middleware.js';
import { prisma } from '../lib/db.js';

const router = Router();

router.use(verifyBackofficeToken as any);

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

// GET /api/backoffice/dashboard/scadenza-grenke
// Prossima trasmissione della lista riacquisti a Grenke (T-20 per difetto,
// chiave timeline.consolidamento_lista). Entro quella data va incassato il
// massimo possibile: dopo, il contratto non entra piu' nella lista.
//
// Le pratiche si raggruppano per data di scadenza — i contratti Grenke scadono
// a blocchi — e si mostra il blocco con la scadenza piu' vicina che abbia
// ancora qualcosa da incassare; se non ce n'e' nessuno, il prossimo in ordine
// di tempo.
router.get('/scadenza-grenke', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configService = await import('../services/config.service.js');
    const giorni = await configService.getNumero('timeline.consolidamento_lista', 20);

    const INCASSABILI = ['DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO', 'RIACQUISTO_IN_ATTESA_CHIAMATA'];

    const pratiche = await prisma.contratto_EOL.findMany({
      where: {
        ambiente: ambienteVista(req),
        data_scadenza: { not: null },
        stato: { in: [...INCASSABILI, 'RIACQUISTO_PAGATO'] },
      },
      select: { data_scadenza: true, stato: true, pricing_riacquisto: true },
    });

    if (pratiche.length === 0) {
      res.json({ presente: false });
      return;
    }

    const blocchi = new Map<string, (typeof pratiche)[number][]>();
    for (const p of pratiche) {
      const k = p.data_scadenza!.toISOString().slice(0, 10);
      blocchi.set(k, [...(blocchi.get(k) ?? []), p]);
    }

    type Riga = (typeof pratiche)[number];
    const ordinati: Array<[string, Riga[]]> = [...blocchi.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const scelto = ordinati.find(([, righe]) => righe.some((p: Riga) => INCASSABILI.includes(p.stato))) ?? ordinati[0]!;
    const dataScadenza = scelto[0];
    const arr: Riga[] = scelto[1];

    const dataInvio = new Date(new Date(dataScadenza).getTime() - giorni * 86400000);
    const oggi = new Date();
    const pagate = arr.filter((p: Riga) => p.stato === 'RIACQUISTO_PAGATO');
    const daIncassare = arr.filter((p: Riga) => INCASSABILI.includes(p.stato));
    const somma = (l: Riga[]) => Math.round(l.reduce((t: number, p: Riga) => t + Number(p.pricing_riacquisto), 0) * 100) / 100;

    res.json({
      presente: true,
      data_invio: dataInvio.toISOString(),
      data_scadenza_contratti: new Date(dataScadenza).toISOString(),
      giorni_mancanti: Math.ceil((dataInvio.getTime() - oggi.getTime()) / 86400000),
      giorni_soglia: giorni,
      totale: arr.length,
      pagate: pagate.length,
      da_incassare: daIncassare.length,
      importo_incassato: somma(pagate),
      importo_da_incassare: somma(daIncassare),
    });
  } catch (err) {
    console.error('[scadenza-grenke] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

// GET /api/backoffice/dashboard/risk-silence-counts
// GET /api/backoffice/dashboard/prossimi-invii
//
// Cosa parte, quando e a quante pratiche. Le soglie sono quelle delle
// Impostazioni, e le condizioni sono le STESSE che usa lo scheduler: se qui
// comparisse una pratica che poi non riceve niente, il riquadro servirebbe
// solo a illudere.
//
// Due avvertenze che il calcolo tiene in conto:
// - i solleciti scattano al giorno ESATTO (giorni == soglia), non "da quel
//   giorno in poi": una pratica che ha superato la soglia senza che lo
//   scheduler sia passato non lo ricevera' mai piu'. Quelle finiscono in
//   `mancate`, perche' e' cio' che si vuole sapere;
// - la prima comunicazione NON e' schedulata: parte a mano dalla lista
//   pratiche. La sua data e' quindi un "da qui in avanti", non un impegno.
// GET /api/backoffice/dashboard/sconto-nuovo-noleggio
//
// Promemoria: lo sconto lo concede una persona, spuntando la spedizione. Se
// nessuno se ne ricorda, al cliente e' stato promesso uno sconto che poi non
// gli viene applicato — e se ne accorge quando gli chiediamo i soldi.
router.get('/sconto-nuovo-noleggio', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configService = await import('../services/config.service.js');
    if (!await configService.getBooleano('flags.abilita_sconto_nuovo_noleggio', true)) {
      res.json({ attivo: false });
      return;
    }

    const { dataLimiteSconto } = await import('../services/pricing.service.js');
    const giorniMinimi = await configService.getNumero('sconto_nuovo_noleggio.giorni_minimi', 30);
    const percentuale = await configService.getNumero('sconto_nuovo_noleggio.percentuale', 15);

    const pratiche = await prisma.contratto_EOL.findMany({
      where: {
        ambiente: ambienteVista(req),
        data_scadenza: { not: null },
        stato: { notIn: ['RIACQUISTO_PAGATO', 'SILENZIO_PERDITA_DEFINITIVA', 'CHIUSA', 'FLEX_ATTIVO'] },
      },
      select: {
        data_scadenza: true, nuovo_noleggio_spedito_il: true,
        nuovo_noleggio_richiesto_il: true,
        beni_esclusi_json: true, pricing_riacquisto_pieno: true,
      },
    });

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    let concessi = 0, inScadenza = 0, ancoraInTempo = 0, dichiarati = 0, dichiaratiInScadenza = 0;

    for (const p of pratiche) {
      if (p.nuovo_noleggio_spedito_il) { concessi++; continue; }
      // Prezzo concordato a mano: lo sconto non si applica, non ha senso
      // contarla fra quelle a cui manca la conferma.
      if (p.beni_esclusi_json || p.pricing_riacquisto_pieno != null) continue;

      const limite = dataLimiteSconto(new Date(p.data_scadenza!), giorniMinimi);
      const giorni = Math.ceil((limite.getTime() - oggi.getTime()) / 86400000);
      if (giorni < 0) continue;
      ancoraInTempo++;
      if (giorni <= 15) inScadenza++;
      // Chi ha dichiarato e non ha ancora la spedizione confermata: sono le
      // persone da seguire, non dei "forse".
      if (p.nuovo_noleggio_richiesto_il) {
        dichiarati++;
        if (giorni <= 15) dichiaratiInScadenza++;
      }
    }

    res.json({
      attivo: true, percentuale, concessi,
      in_scadenza: inScadenza, ancora_in_tempo: ancoraInTempo,
      dichiarati, dichiarati_in_scadenza: dichiaratiInScadenza,
    });
  } catch (err) {
    console.error('[sconto-nuovo-noleggio] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/prossimi-invii', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const configService = await import('../services/config.service.js');
    const ambiente = ambienteVista(req);

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const giorniA = (scadenza: Date, soglia: number) => {
      const d = new Date(scadenza);
      d.setHours(0, 0, 0, 0);
      return new Date(d.getTime() - soglia * 86400000);
    };

    type Voce = {
      tipo: string; etichetta: string; soglia: number; manuale: boolean;
      data: string | null; pratiche: number; pronte_ora: number; mancate: number; totale_attesa: number;
    };
    const voci: Voce[] = [];

    /** Raggruppa le pratiche per data di invio e restituisce il primo blocco utile. */
    function prossimoBlocco(
      candidate: Array<{ data_scadenza: Date | null }>,
      soglia: number,
      immediato: boolean,
    ) {
      let pronteOra = 0, mancate = 0;
      const perData = new Map<number, number>();
      for (const c of candidate) {
        if (!c.data_scadenza) continue;
        const quando = giorniA(c.data_scadenza, soglia);
        if (quando.getTime() < oggi.getTime()) {
          // Soglia gia' superata: se l'invio e' a soglia "<=" parte al primo
          // giro utile, altrimenti e' persa.
          if (immediato) pronteOra++; else mancate++;
          continue;
        }
        perData.set(quando.getTime(), (perData.get(quando.getTime()) ?? 0) + 1);
      }
      const prossima = [...perData.keys()].sort((a, b) => a - b)[0];
      return {
        data: pronteOra > 0 ? oggi.toISOString() : prossima ? new Date(prossima).toISOString() : null,
        pratiche: pronteOra > 0 ? pronteOra : prossima ? perData.get(prossima)! : 0,
        pronte_ora: pronteOra,
        mancate,
        totale_attesa: candidate.length,
      };
    }

    // --- Prima comunicazione (manuale) ---
    const sogliaIniziale = await configService.getNumero('timeline.comunicazione_iniziale', 82);
    const daComunicare = await prisma.contratto_EOL.findMany({
      where: { stato: 'LISTA_RICEVUTA', ambiente, cliente: { opt_out_comunicazioni: false } },
      select: { data_scadenza: true },
    });
    voci.push({
      tipo: 'COMUNICAZIONE_INIZIALE', etichetta: 'Prima comunicazione',
      soglia: sogliaIniziale, manuale: true,
      ...prossimoBlocco(daComunicare, sogliaIniziale, true),
    });

    // --- Solleciti (scheduler, giorno esatto) ---
    const solleciti = [
      { tipo: 'SOLLECITO_1', etichetta: '1o sollecito', chiave: 'timeline.sollecito_email_1', def: 90 },
      { tipo: 'SOLLECITO_2', etichetta: '2o sollecito', chiave: 'timeline.sollecito_email_2', def: 60 },
      { tipo: 'SOLLECITO_3', etichetta: '3o sollecito', chiave: 'timeline.sollecito_email_3', def: 45 },
      { tipo: 'SOLLECITO_4', etichetta: '4o sollecito', chiave: 'timeline.sollecito_email_4', def: 35 },
    ];
    for (const s of solleciti) {
      const soglia = await configService.getNumero(s.chiave, s.def);
      const candidate = await prisma.contratto_EOL.findMany({
        where: {
          stato: { in: ['COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE'] },
          ambiente,
          cliente: { opt_out_comunicazioni: false },
          comunicazioni: { none: { tipo: s.tipo } },
        },
        select: { data_scadenza: true },
      });
      voci.push({ tipo: s.tipo, etichetta: s.etichetta, soglia, manuale: false, ...prossimoBlocco(candidate, soglia, false) });
    }

    // --- Invito al pagamento (soglia "entro", quindi recupera i ritardi) ---
    const sogliaPagamento = await configService.getNumero('timeline.pagamento_riacquisto', 26);
    const daPagare = await prisma.contratto_EOL.findMany({
      where: {
        stato: { in: ['DECISIONE_RIACQUISTO', 'DECISIONE_RIACQUISTO_IN_CORSO'] },
        ambiente,
        comunicazioni: { none: { tipo: 'INVITO_PAGAMENTO' } },
      },
      select: { data_scadenza: true },
    });
    voci.push({
      tipo: 'INVITO_PAGAMENTO', etichetta: 'Richiesta di pagamento',
      soglia: sogliaPagamento, manuale: false,
      ...prossimoBlocco(daPagare, sogliaPagamento, true),
    });

    res.json({ invii: voci.filter(v => v.pratiche > 0 || v.mancate > 0) });
  } catch (err) {
    console.error('[prossimi-invii] Errore:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

router.get('/risk-silence-counts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: 'IN_ATTESA_DECISIONE', ambiente: ambienteVista(req) },
      select: { id: true, data_scadenza: true },
    });

    let t50 = 0, t40 = 0, t35 = 0;
    const t50Ids: string[] = [], t40Ids: string[] = [], t35Ids: string[] = [];

    for (const p of pratiche) {
      if (!p.data_scadenza) continue;
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
router.get('/kpi', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const allPratiche = await prisma.contratto_EOL.findMany({
      where: {
        data_scadenza: { gte: startOfYear, lt: endOfYear },
        stato: { not: 'FLEX_ATTIVO' },
        ambiente: ambienteVista(req),
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

    const segnalazioni_da_gestire = await prisma.monitoredEmail.count({ where: { status: { in: ['NEW', 'NOTIFIED'] } } });

    res.json({
      segnalazioni_da_gestire,
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
router.get('/pratiche-recenti', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pratiche = await prisma.contratto_EOL.findMany({
      where: { stato: { not: 'FLEX_ATTIVO' }, ambiente: ambienteVista(req) },
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
