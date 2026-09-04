import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { emailProviderPerAmbiente, pecProviderPerAmbiente } from '../providers/notification/email.provider.js';
import { registraEvento } from './audit.service.js';
import { prisma } from '../lib/db.js';
import { formatBeniLista, formatBeniInclusi, beniEsclusi, formatBene, isRiacquistoParziale } from '../lib/beni.js';
import * as configService from './config.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
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
