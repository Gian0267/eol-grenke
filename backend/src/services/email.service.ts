import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { emailProviderPerAmbiente, pecProviderPerAmbiente } from '../providers/notification/email.provider.js';
import { registraEvento } from './audit.service.js';
import { prisma } from '../lib/db.js';
import { formatBeniLista, formatBeniInclusi, beniEsclusi, formatBene, isRiacquistoParziale } from '../lib/beni.js';
import { origineCorrisponde, normalizzaOrigine } from '../lib/origine.js';
import * as configService from './config.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 21);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// L'opt-out e' una rotta del backend, che in produzione serve anche il
// frontend sullo stesso origin; in sviluppo Vite fa da proxy su /api. Usare
// FRONTEND_URL evita il localhost cablato, che rendeva il link inutilizzabile
// per il destinatario (43 comunicazioni cosi' fino al 01/09/2026).
const BACKEND_URL = FRONTEND_URL;

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface InvioResult {
  success: boolean;
  contrattoId: string;
  emailInviate: number;
  errori: string[];
}

export async function inviaComunicazioneIniziale(
  contratto_eol_id: string,
  // canale: sul reinvio si può limitare a un solo canale (es. solo PEC quando
  // l'email era già partita — caso reale del 21/07/2026, PEC fallite per 535)
  opts?: { reinvio?: boolean; canale?: 'EMAIL' | 'PEC' | 'TUTTI' },
): Promise<InvioResult> {
  const reinvio = opts?.reinvio === true;
  const canaleRichiesto = opts?.canale && opts.canale !== 'TUTTI' ? opts.canale : null;
  const result: InvioResult = { success: false, contrattoId: contratto_eol_id, emailInviate: 0, errori: [] };

  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contratto_eol_id },
    include: { cliente: true, decisioni: true },
  });

  if (!contratto) {
    result.errori.push('Contratto non trovato');
    return result;
  }

  // Primo invio: solo da LISTA_RICEVUTA. Reinvio (backoffice): anche a
  // comunicazione già inviata, purché il cliente non abbia già deciso.
  const statiAmmessi = reinvio
    ? ['LISTA_RICEVUTA', 'COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE']
    : ['LISTA_RICEVUTA'];
  if (!statiAmmessi.includes(contratto.stato)) {
    result.errori.push(
      reinvio
        ? `Stato non valido per il reinvio: ${contratto.stato}`
        : `Stato non valido: ${contratto.stato} (atteso LISTA_RICEVUTA)`,
    );
    return result;
  }

  if (reinvio && contratto.decisioni.length > 0) {
    result.errori.push('Il cliente ha già comunicato una decisione: reinvio non consentito');
    return result;
  }

  if (contratto.cliente.opt_out_comunicazioni) {
    result.errori.push('Cliente ha richiesto opt-out comunicazioni');
    return result;
  }

  const dataScadenza = new Date(contratto.data_scadenza!);
  const deadlineMs = dataScadenza.getTime() - JWT_EXPIRES_OFFSET_DAYS * 24 * 60 * 60 * 1000;
  const deadline = new Date(deadlineMs);

  const exp = Math.floor(deadlineMs / 1000);
  const token = jwt.sign(
    {
      contratto_eol_id: contratto.id,
      cliente_id: contratto.cliente_id,
      exp,
    },
    JWT_SECRET,
  );

  const optOutToken = jwt.sign(
    { cliente_id: contratto.cliente_id, action: 'opt-out' },
    JWT_SECRET,
    { expiresIn: '365d' },
  );

  await prisma.contratto_EOL.update({
    where: { id: contratto.id },
    data: { token_accesso_cliente: token },
  });

  const beniFormatted = formatBeniLista(contratto.beni_json);
  // Riacquisto parziale: la clausola "l'acquisto riguarda tutti i beni" sarebbe
  // falsa per questo cliente, quindi i template la sostituiscono con l'elenco.
  const riacquistoParziale = isRiacquistoParziale(contratto.beni_esclusi_json);
  const beniRiacquisto = formatBeniInclusi(contratto.beni_json, contratto.beni_esclusi_json);
  const beniDaRestituire = beniEsclusi(contratto.beni_json, contratto.beni_esclusi_json).map(formatBene).join(', ');

  // Flag "Opzione Rinnovo attiva": quando è OFF i template nascondono l'opzione
  // rinnovo e le altre opzioni vengono rinumerate 1-2-3.
  const opzioneRinnovoAttiva = await configService.getBooleano('flags.abilita_opzione_rinnovo', true);

  // Blocco "nuovo noleggio": solo per i clienti provenienti da Italiaonline.
  // Le diciture stanno nelle Impostazioni perche' `origine` riporta il "broker
  // name" del file Grenke, che puo' cambiare forma senza preavviso.
  const dicitureIol = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
    .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);
  const clienteIol = origineCorrisponde(contratto.origine, dicitureIol);
  const linkNuovoNoleggio = await configService.getTesto(
    'iol.link_nuovo_noleggio',
    'https://app.noleggiosumisura.it/start?agente=4af90182-76b9-46f7-a395-57b46155d95c-0b4a0690-a073-43d6-a08d-c17cfb13f444',
  );
  const pagamentoOnlineAttivo = await configService.getBooleano('flags.abilita_pagamento_online', false);

  const templateVars = {
    opzione_rinnovo_attiva: opzioneRinnovoAttiva,
    pagamento_online_attivo: pagamentoOnlineAttivo,
    num_opzione_riacquisto: opzioneRinnovoAttiva ? 2 : 1,
    num_opzione_contatto: opzioneRinnovoAttiva ? 3 : 2,
    num_opzione_restituzione: opzioneRinnovoAttiva ? 4 : 3,
    ragione_sociale: contratto.cliente.ragione_sociale,
    numero_contratto_grenke: contratto.contratto_grenke_id,
    numero_contratto_nsm: contratto.contratto_nsm_id,
    data_scadenza: formatDate(dataScadenza),
    beni: beniFormatted,
    cliente_iol: clienteIol,
    link_nuovo_noleggio: linkNuovoNoleggio,
    email_nuovo_noleggio: await configService.getTesto('recapiti.email', 'info@noleggiosumisura.it'),
    riacquisto_parziale: riacquistoParziale,
    beni_riacquisto: beniRiacquisto,
    beni_da_restituire: beniDaRestituire,
    monte_canoni: formatEur(Number(contratto.monte_canoni)),
    pricing_riacquisto: formatEur(Number(contratto.pricing_riacquisto)),
    valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
    valore_sconto_bronze: formatEur(Number(contratto.valore_gift_card)),
    link_area_cliente: `${FRONTEND_URL}/pratica/${token}`,
    deadline_decisione: formatDate(deadline),
    link_opt_out: `${BACKEND_URL}/api/clienti/opt-out?token=${optOutToken}`,
  };

  let templateHtml = await configService.getHtml('email.comunicazione_iniziale');
  if (!templateHtml) {
    const templatePath = resolve(__dirname, '../../../templates/email/comunicazione_iniziale.html');
    templateHtml = readFileSync(templatePath, 'utf-8');
  }
  const html = Handlebars.compile(templateHtml)(templateVars);

  // Il canale PEC usa un template istituzionale dedicato (sobrio, senza
  // elementi grafici colorati), più adatto a una comunicazione certificata.
  let templatePecHtml = await configService.getHtml('email.comunicazione_iniziale_pec');
  if (!templatePecHtml) {
    const templatePecPath = resolve(__dirname, '../../../templates/email/comunicazione_iniziale_pec.html');
    templatePecHtml = readFileSync(templatePecPath, 'utf-8');
  }
  const htmlPec = Handlebars.compile(templatePecHtml)(templateVars);

  const oggetto = `Comunicazione relativa al Suo contratto di locazione operativa n. ${contratto.contratto_grenke_id} in scadenza`;

  let destinatari: Array<{ email: string; canale: string }> = [
    { email: contratto.cliente.email, canale: 'EMAIL' },
  ];

  if (contratto.cliente.pec && contratto.cliente.pec !== contratto.cliente.email) {
    destinatari.push({ email: contratto.cliente.pec, canale: 'PEC' });
  }

  if (canaleRichiesto) {
    destinatari = destinatari.filter((d) => d.canale === canaleRichiesto);
    if (destinatari.length === 0) {
      result.errori.push(canaleRichiesto === 'PEC' ? 'Il cliente non ha una PEC distinta dall\'email' : 'Nessun destinatario per il canale richiesto');
      return result;
    }
  }

  let almenoUnInvioOk = false;

  for (const dest of destinatari) {
    // Il canale PEC usa il provider PEC certificato (se configurato) e il
    // template istituzionale; altrimenti provider e template ordinari.
    const isPec = dest.canale === 'PEC';
    // Routing per ambiente della pratica: TEST → casella di raccolta test (PEC simulata)
    const pecPerPratica = pecProviderPerAmbiente(contratto.ambiente);
    const provider = isPec && pecPerPratica ? pecPerPratica : emailProviderPerAmbiente(contratto.ambiente);
    const corpo = isPec ? htmlPec : html;
    const sendResult = await provider.send(dest.email, oggetto, corpo);

    await prisma.comunicazione.create({
      data: {
        contratto_eol_id: contratto.id,
        tipo: 'COMUNICAZIONE_INIZIALE',
        canale: dest.canale,
        destinatario: dest.email,
        oggetto,
        corpo_html: corpo,
        data_invio: new Date(),
        esito_invio: sendResult.success ? 'INVIATO' : 'ERRORE',
        operatore_id: null,
      },
    });

    if (sendResult.success) {
      almenoUnInvioOk = true;
      result.emailInviate++;
    } else {
      result.errori.push(`Errore invio a ${dest.email}: ${sendResult.error}`);
    }
  }

  if (almenoUnInvioOk) {
    // Sul reinvio lo stato non viene toccato (evita regressioni da IN_ATTESA_DECISIONE)
    if (contratto.stato === 'LISTA_RICEVUTA') {
      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: { stato: 'COMUNICAZIONE_INVIATA' },
      });
    }
    result.success = true;

    await registraEvento(contratto.id, 'SISTEMA', 'EMAIL_SERVICE', 'COMUNICAZIONE_INVIATA', {
      tipo: 'COMUNICAZIONE_INIZIALE',
      reinvio,
      destinatari: destinatari.map(d => d.email),
      email_inviate: result.emailInviate,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Proposta di nuovo noleggio                                         */
/* ------------------------------------------------------------------ */

export const TIPO_PROPOSTA_NOLEGGIO = 'PROPOSTA_NUOVO_NOLEGGIO';

/**
 * Comunicazione commerciale a se' stante: propone di attivare un nuovo
 * noleggio, indipendentemente da come il cliente decidera' sul contratto in
 * scadenza.
 *
 * Nata come riquadro dentro la comunicazione iniziale, ne e' uscita il
 * 17/09/2026 perche' Italiaonline non aveva ancora autorizzato a proporre
 * nuovi noleggi ai propri clienti: da allora e' un invio separato, che parte
 * a mano dal backoffice quando l'autorizzazione c'e'.
 *
 * Solo canale EMAIL: la PEC e' il canale delle comunicazioni contrattuali, e
 * consumarne una per una proposta commerciale sarebbe fuori luogo (oltre che
 * a pagamento).
 *
 * Va anche a chi non ha ancora deciso sul fine contratto — scelta esplicita
 * del titolare — ma in quel caso la mail glielo ricorda e rimanda all'area
 * riservata, per non lasciargli credere di aver assolto alla decisione.
 */
export async function inviaPropostaNuovoNoleggio(
  contratto_eol_id: string,
  operatoreId?: string,
): Promise<InvioResult> {
  const result: InvioResult = { success: false, contrattoId: contratto_eol_id, emailInviate: 0, errori: [] };

  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contratto_eol_id },
    include: { cliente: true, decisioni: true },
  });
  if (!contratto) {
    result.errori.push('Contratto non trovato');
    return result;
  }

  // L'opt-out vale anche qui, anzi soprattutto: e' una mail commerciale.
  if (contratto.cliente.opt_out_comunicazioni) {
    result.errori.push('Cliente ha richiesto opt-out comunicazioni');
    return result;
  }
  if (!contratto.cliente.email) {
    result.errori.push('Cliente senza indirizzo email');
    return result;
  }

  // Una sola proposta per cliente, non per pratica: se domani un cliente avra'
  // due contratti Italiaonline non deve ricevere due volte la stessa offerta.
  const gia = await prisma.comunicazione.findFirst({
    where: {
      tipo: TIPO_PROPOSTA_NOLEGGIO,
      esito_invio: 'INVIATO',
      contratto_eol: { cliente_id: contratto.cliente_id },
    },
    select: { data_invio: true },
  });
  if (gia) {
    result.errori.push(`Proposta gia' inviata a questo cliente il ${formatDate(gia.data_invio)}`);
    return result;
  }

  // Quale link mettere nella mail. Porta l'identificativo dell'agente, quindi
  // il contatto che ne nasce viene attribuito a qualcuno: sbagliarlo sposta una
  // provvigione. Per questo non esiste un link di riserva — se non si sa quale
  // usare, non si manda.
  const dicitureIolLink = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
    .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);
  let linkNuovoNoleggio: string;

  if (origineCorrisponde(contratto.origine, dicitureIolLink)) {
    // Italiaonline ha un suo link unico, impostato a parte.
    linkNuovoNoleggio = await configService.getTesto('iol.link_nuovo_noleggio', '');
    if (!linkNuovoNoleggio) {
      result.errori.push('Manca il link di registrazione per i clienti Italiaonline (Impostazioni)');
      return result;
    }
  } else {
    if (!contratto.agenzia) {
      result.errori.push('La pratica non indica un\'agenzia: impossibile scegliere il link di registrazione');
      return result;
    }
    // Il legame con l'anagrafica e' il nome scritto nell'export NSM, non una
    // chiave: confronto tollerante, come per le origini.
    const agenzie = await prisma.agenzia.findMany({ select: { nome: true, link_onboarding: true } });
    const cercata = normalizzaOrigine(contratto.agenzia);
    const trovata = agenzie.find(a => normalizzaOrigine(a.nome) === cercata);

    if (!trovata) {
      result.errori.push(`L'agenzia "${contratto.agenzia}" non e' in anagrafica: aggiungila e indica il suo link`);
      return result;
    }
    if (!trovata.link_onboarding) {
      result.errori.push(`L'agenzia "${trovata.nome}" non ha ancora un link di registrazione`);
      return result;
    }
    linkNuovoNoleggio = trovata.link_onboarding;
  }

  // Il richiamo alla decisione compare solo a chi non ha ancora scelto.
  const decisioneMancante = contratto.decisioni.length === 0;
  let linkAreaCliente = '';
  if (decisioneMancante && contratto.data_scadenza) {
    const exp = Math.floor(
      (new Date(contratto.data_scadenza).getTime() - JWT_EXPIRES_OFFSET_DAYS * 86400000) / 1000,
    );
    // Un token gia' scaduto darebbe un link morto: in quel caso si tace,
    // invece di mandare il cliente contro un errore.
    if (exp > Math.floor(Date.now() / 1000)) {
      const token = jwt.sign(
        { contratto_eol_id: contratto.id, cliente_id: contratto.cliente_id, exp },
        JWT_SECRET,
      );
      linkAreaCliente = `${FRONTEND_URL}/pratica/${token}`;
    }
  }

  const templateVars = {
    ragione_sociale: contratto.cliente.ragione_sociale,
    numero_contratto_grenke: contratto.contratto_grenke_id,
    data_scadenza: contratto.data_scadenza ? formatDate(new Date(contratto.data_scadenza)) : '',
    link_nuovo_noleggio: linkNuovoNoleggio,
    email_nuovo_noleggio: await configService.getTesto('recapiti.email', 'info@noleggiosumisura.it'),
    decisione_mancante: decisioneMancante && linkAreaCliente !== '',
    link_area_cliente: linkAreaCliente,
  };

  let templateHtml = await configService.getHtml('email.proposta_nuovo_noleggio');
  if (!templateHtml) {
    templateHtml = readFileSync(
      resolve(__dirname, '../../../templates/email/proposta_nuovo_noleggio.html'),
      'utf-8',
    );
  }
  const html = Handlebars.compile(templateHtml)(templateVars);
  const oggetto = await configService.getTesto(
    'email.proposta_nuovo_noleggio_oggetto',
    'Dispositivi nuovi per la Sua azienda',
  );

  const provider = emailProviderPerAmbiente(contratto.ambiente);
  const sendResult = await provider.send(contratto.cliente.email, oggetto, html);

  await prisma.comunicazione.create({
    data: {
      contratto_eol_id: contratto.id,
      tipo: TIPO_PROPOSTA_NOLEGGIO,
      canale: 'EMAIL',
      destinatario: contratto.cliente.email,
      oggetto,
      corpo_html: html,
      data_invio: new Date(),
      esito_invio: sendResult.success ? 'INVIATO' : 'ERRORE',
      operatore_id: operatoreId ?? null,
    },
  });

  if (!sendResult.success) {
    result.errori.push(`Errore invio a ${contratto.cliente.email}: ${sendResult.error}`);
    return result;
  }

  result.success = true;
  result.emailInviate = 1;

  // Lo stato della pratica NON cambia: questa comunicazione e' commerciale e
  // non fa avanzare il fine contratto.
  await registraEvento(contratto.id, 'BACKOFFICE', operatoreId ?? 'system', 'COMUNICAZIONE_INVIATA', {
    tipo: TIPO_PROPOSTA_NOLEGGIO,
    destinatario: contratto.cliente.email,
    decisione_mancante: decisioneMancante,
  });

  return result;
}
