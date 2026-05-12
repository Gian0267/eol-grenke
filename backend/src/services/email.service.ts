import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { SmtpEmailProvider } from '../providers/notification/email.provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(__dirname, '../../../templates/email/comunicazione_iniziale.html');
const templateSource = readFileSync(templatePath, 'utf-8');
const compiledTemplate = Handlebars.compile(templateSource);

const emailProvider = new SmtpEmailProvider();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = `http://localhost:${process.env.PORT || 3001}`;

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

export async function inviaComunicazioneIniziale(contratto_eol_id: string): Promise<InvioResult> {
  const result: InvioResult = { success: false, contrattoId: contratto_eol_id, emailInviate: 0, errori: [] };

  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contratto_eol_id },
    include: { cliente: true },
  });

  if (!contratto) {
    result.errori.push('Contratto non trovato');
    return result;
  }

  if (contratto.stato !== 'LISTA_RICEVUTA') {
    result.errori.push(`Stato non valido: ${contratto.stato} (atteso LISTA_RICEVUTA)`);
    return result;
  }

  if (contratto.cliente.opt_out_comunicazioni) {
    result.errori.push('Cliente ha richiesto opt-out comunicazioni');
    return result;
  }

  const dataScadenza = new Date(contratto.data_scadenza);
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

  const beni = contratto.beni_json ? JSON.parse(contratto.beni_json) : [];
  const beniFormatted = beni.map((b: { descrizione?: string }) => b.descrizione || 'N/D').join(', ');

  const templateVars = {
    ragione_sociale: contratto.cliente.ragione_sociale,
    numero_contratto_grenke: contratto.contratto_grenke_id,
    numero_contratto_nsm: contratto.contratto_nsm_id,
    data_scadenza: formatDate(dataScadenza),
    beni: beniFormatted || 'Beni come da contratto',
    monte_canoni: formatEur(Number(contratto.monte_canoni)),
    pricing_riacquisto: formatEur(Number(contratto.pricing_riacquisto)),
    valore_gift_card: formatEur(Number(contratto.valore_gift_card)),
    link_area_cliente: `${FRONTEND_URL}/pratica/${token}`,
    deadline_decisione: formatDate(deadline),
    link_opt_out: `${BACKEND_URL}/api/clienti/opt-out?token=${optOutToken}`,
  };

  const html = compiledTemplate(templateVars);
  const oggetto = `Comunicazione relativa al Suo contratto di locazione operativa n. ${contratto.contratto_nsm_id} in scadenza`;

  const destinatari: Array<{ email: string; canale: string }> = [
    { email: contratto.cliente.email, canale: 'EMAIL' },
  ];

  if (contratto.cliente.pec && contratto.cliente.pec !== contratto.cliente.email) {
    destinatari.push({ email: contratto.cliente.pec, canale: 'PEC' });
  }

  let almenoUnInvioOk = false;

  for (const dest of destinatari) {
    const sendResult = await emailProvider.send(dest.email, oggetto, html);

    await prisma.comunicazione.create({
      data: {
        contratto_eol_id: contratto.id,
        tipo: 'COMUNICAZIONE_INIZIALE',
        canale: dest.canale,
        destinatario: dest.email,
        oggetto,
        corpo_html: html,
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
    await prisma.contratto_EOL.update({
      where: { id: contratto.id },
      data: { stato: 'COMUNICAZIONE_INVIATA' },
    });
    result.success = true;
  }

  return result;
}
