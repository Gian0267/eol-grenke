/**
 * Monitor IMAP della casella info@smartcomsolutions.it.
 *
 * VINCOLO ASSOLUTO: la casella non viene MAI modificata — connessione in sola
 * lettura (mailbox aperta readOnly: niente move, delete, flag o mark-as-read).
 * La deduplicazione avviene lato applicazione (Message-ID univoco a DB).
 *
 * Ogni 15 minuti (tick dello scheduler o trigger esterno) le mail nuove
 * vengono classificate per keyword; ogni mattina all'orario configurato parte
 * il digest con le segnalazioni non ancora notificate.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/db.js';
import { registraEvento } from './audit.service.js';
import { createEmailProvider } from '../providers/notification/email.provider.js';
import * as configService from './config.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const emailProvider = createEmailProvider();

const KEYWORDS_DEFAULT = [
  'fine contratto', 'fine noleggio', 'fine locazione', 'eol', 'end of lease',
  'grenke', 'restituzione', 'riscatto', 'riacquisto', 'proroga', 'rinnovo',
  'scadenza contratto',
];

// Mittenti interni: mai segnalati (evita auto-segnalazioni dei reminder dell'app)
const DOMINI_INTERNI = ['smartcomsolutions.it', 'noleggiosumisura.it', 'smartcomgroup.it'];

// Domini generici: esclusi dal collegamento per dominio (troppi falsi positivi)
const DOMINI_GENERICI = new Set([
  'gmail.com', 'outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it', 'live.com', 'live.it',
  'yahoo.com', 'yahoo.it', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tin.it',
  'icloud.com', 'me.com', 'pec.it', 'legalmail.it', 'pecimprese.it', 'arubapec.it', 'postecert.it',
]);

let fallimentiConsecutivi = 0;
let alertInviato = false;

function normalizza(testo: string): string {
  return testo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getKeywords(): Promise<string[]> {
  const raw = await configService.getTesto('monitor.keywords', '');
  const lista = raw
    .split(/[\n,;]+/)
    .map(k => k.trim())
    .filter(Boolean);
  return lista.length > 0 ? lista : KEYWORDS_DEFAULT;
}

async function getDestinatari(): Promise<string[]> {
  const raw = await configService.getTesto('monitor.digest_destinatari', '');
  return raw.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'));
}

function mittenteInterno(address: string): boolean {
  const dom = address.split('@')[1]?.toLowerCase() || '';
  const appFrom = [process.env.RESEND_FROM, process.env.SMTP_FROM, process.env.PEC_FROM]
    .filter(Boolean)
    .map(f => String(f).replace(/^.*</, '').replace(/>.*$/, '').toLowerCase());
  return DOMINI_INTERNI.includes(dom) || appFrom.includes(address.toLowerCase());
}

function classifica(subject: string, body: string, keywords: string[]): string[] {
  const testo = normalizza(`${subject}\n${body}`);
  return keywords.filter(k => testo.includes(normalizza(k)));
}

/** Collega la mail a un contratto EOL: match esatto su email/PEC cliente, poi per dominio (non generico). */
async function collegaContratto(fromAddress: string): Promise<string | null> {
  const addr = fromAddress.toLowerCase();
  const perEmail = await prisma.contratto_EOL.findFirst({
    where: { cliente: { OR: [{ email: { equals: addr, mode: 'insensitive' } }, { pec: { equals: addr, mode: 'insensitive' } }] } },
    orderBy: { data_scadenza: 'desc' },
    select: { id: true },
  });
  if (perEmail) return perEmail.id;

  const dominio = addr.split('@')[1];
  if (!dominio || DOMINI_GENERICI.has(dominio)) return null;
  const perDominio = await prisma.contratto_EOL.findFirst({
    where: { cliente: { OR: [{ email: { endsWith: `@${dominio}`, mode: 'insensitive' } }, { pec: { endsWith: `@${dominio}`, mode: 'insensitive' } }] } },
    orderBy: { data_scadenza: 'desc' },
    select: { id: true },
  });
  return perDominio?.id ?? null;
}

function imapConfigurato(): boolean {
  return Boolean(process.env.MONITOR_IMAP_HOST && process.env.MONITOR_IMAP_USER && process.env.MONITOR_IMAP_PASSWORD);
}

function nuovoClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.MONITOR_IMAP_HOST!,
    port: Number(process.env.MONITOR_IMAP_PORT || 993),
    secure: process.env.MONITOR_IMAP_SECURE !== 'false',
    auth: { user: process.env.MONITOR_IMAP_USER!, pass: process.env.MONITOR_IMAP_PASSWORD! },
    logger: false,
  });
}

export interface MonitorPollResult {
  eseguito: boolean;
  motivo?: string;
  esaminate: number;
  nuove_segnalazioni: number;
  errori: string[];
}

/** Un giro di polling: legge le mail recenti (sola lettura) e salva le segnalazioni nuove. */
export async function pollMonitor(): Promise<MonitorPollResult> {
  const result: MonitorPollResult = { eseguito: false, esaminate: 0, nuove_segnalazioni: 0, errori: [] };

  const attivo = await configService.getBooleano('flags.abilita_monitor_casella', true);
  if (!attivo) {
    result.motivo = 'Monitor disattivato dalle impostazioni';
    return result;
  }
  if (!imapConfigurato()) {
    result.motivo = 'Credenziali IMAP non configurate (MONITOR_IMAP_*)';
    return result;
  }

  const client = nuovoClient();
  try {
    await client.connect();
    // READ-ONLY: nessuna modifica alla casella, mai
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Passo 1: solo envelope, per individuare i Message-ID mai visti
      const candidate: Array<{ uid: number; messageId: string; from: string; fromName: string; subject: string; date: Date }> = [];
      for await (const msg of client.fetch({ since }, { uid: true, envelope: true, internalDate: true })) {
        const messageId = msg.envelope?.messageId || `uid-${msg.uid}@${process.env.MONITOR_IMAP_USER}`;
        const fromAddr = msg.envelope?.from?.[0]?.address || '';
        candidate.push({
          uid: msg.uid,
          messageId,
          from: fromAddr,
          fromName: msg.envelope?.from?.[0]?.name || '',
          subject: msg.envelope?.subject || '(senza oggetto)',
          date: msg.internalDate ? new Date(msg.internalDate) : msg.envelope?.date ? new Date(msg.envelope.date) : new Date(),
        });
      }
      result.esaminate = candidate.length;

      const visti = new Set(
        (await prisma.monitoredEmail.findMany({
          where: { message_id: { in: candidate.map(c => c.messageId) } },
          select: { message_id: true },
        })).map(m => m.message_id),
      );

      const keywords = await getKeywords();

      for (const c of candidate) {
        if (visti.has(c.messageId)) continue;
        if (!c.from || mittenteInterno(c.from)) continue;

        // Passo 2: scarica il corpo SOLO delle mail nuove (sempre read-only)
        const { content } = await client.download(String(c.uid), undefined, { uid: true });
        const chunks: Buffer[] = [];
        for await (const chunk of content) chunks.push(chunk as Buffer);
        const parsed = await simpleParser(Buffer.concat(chunks));
        const corpo = parsed.text || (parsed.html ? stripHtml(String(parsed.html)) : '');

        const matched = classifica(c.subject, corpo, keywords);
        if (matched.length === 0) continue;

        const contrattoId = await collegaContratto(c.from);
        await prisma.monitoredEmail.create({
          data: {
            imap_uid: c.uid,
            message_id: c.messageId,
            from_address: c.from,
            from_name: c.fromName || null,
            subject: c.subject,
            received_at: c.date,
            snippet: corpo.slice(0, 300),
            matched_keywords: JSON.stringify(matched),
            status: 'NEW',
            contratto_eol_id: contrattoId,
          },
        });
        result.nuove_segnalazioni++;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    result.eseguito = true;
    fallimentiConsecutivi = 0;
    alertInviato = false;
  } catch (err) {
    try { await client.logout(); } catch { /* già chiusa */ }
    const msg = err instanceof Error ? err.message : String(err);
    result.errori.push(msg);
    console.error('[Monitor] Errore polling IMAP:', msg);

    fallimentiConsecutivi++;
    if (fallimentiConsecutivi >= 3 && !alertInviato) {
      alertInviato = true;
      await inviaAlertTecnico(msg).catch(e => console.error('[Monitor] Alert tecnico fallito:', e));
    }
  }
  return result;
}

async function inviaAlertTecnico(ultimoErrore: string): Promise<void> {
  const destinatari = await getDestinatari();
  if (destinatari.length === 0) return;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#374151;font-size:14px;line-height:1.6;">
      <p><strong>⚠️ Monitor casella info@ — connessione IMAP in errore</strong></p>
      <p>Il monitoraggio della casella ${process.env.MONITOR_IMAP_USER} ha fallito ${fallimentiConsecutivi} tentativi consecutivi.</p>
      <p>Ultimo errore: <code>${ultimoErrore}</code></p>
      <p>Verificare credenziali e raggiungibilità del server ${process.env.MONITOR_IMAP_HOST}. Il monitor riproverà automaticamente a ogni ciclo.</p>
    </div>`;
  for (const dest of destinatari) {
    await emailProvider.send(dest, '[ALERT] Monitor casella info@ — connessione IMAP fallita', html, { cc: null });
  }
  await registraEvento(null, 'SISTEMA', 'MAIL_MONITOR', 'MONITOR_ALERT_TECNICO', {
    fallimenti: fallimentiConsecutivi,
    errore: ultimoErrore,
    destinatari,
  });
}

/** True se oggi (Europe/Rome) il digest è già stato inviato (traccia nell'audit). */
async function digestGiaInviatoOggi(oggiRome: string): Promise<boolean> {
  const ultimo = await prisma.audit_Event.findFirst({
    where: { azione: 'MONITOR_DIGEST_INVIATO' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  if (!ultimo) return false;
  return dataRome(ultimo.timestamp) === oggiRome;
}

function dataRome(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // yyyy-mm-dd
}

function orarioRome(d: Date): string {
  return d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }); // HH:mm
}

/** Invia il digest mattutino se è l'ora configurata e non è già partito oggi. Nessun invio senza segnalazioni. */
export async function inviaDigestSeDovuto(adesso = new Date()): Promise<{ inviato: boolean; segnalazioni: number; motivo?: string }> {
  const attivo = await configService.getBooleano('flags.abilita_monitor_casella', true);
  if (!attivo) return { inviato: false, segnalazioni: 0, motivo: 'Monitor disattivato' };

  const orario = await configService.getTesto('monitor.digest_orario', '08:00');
  if (orarioRome(adesso) < orario) return { inviato: false, segnalazioni: 0, motivo: `Prima delle ${orario}` };
  if (await digestGiaInviatoOggi(dataRome(adesso))) return { inviato: false, segnalazioni: 0, motivo: 'Già inviato oggi' };

  const nuove = await prisma.monitoredEmail.findMany({
    where: { status: 'NEW' },
    include: { contratto_eol: { select: { contratto_nsm_id: true, contratto_grenke_id: true, data_scadenza: true } } },
    orderBy: { received_at: 'desc' },
  });
  if (nuove.length === 0) return { inviato: false, segnalazioni: 0, motivo: 'Nessuna segnalazione nuova' };

  const destinatari = await getDestinatari();
  if (destinatari.length === 0) return { inviato: false, segnalazioni: nuove.length, motivo: 'Nessun destinatario configurato' };

  const templatePath = resolve(__dirname, '../../../templates/email/digest_monitor.html');
  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'));
  const frontendUrl = process.env.FRONTEND_URL || 'https://eol.smartcomgroup.it';
  const html = template({
    data: adesso.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'long', year: 'numeric' }),
    totale: nuove.length,
    link_backoffice: `${frontendUrl}/backoffice/segnalazioni-casella`,
    segnalazioni: nuove.map(m => ({
      mittente: m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address,
      oggetto: m.subject,
      data_ora: m.received_at.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      snippet: m.snippet,
      keywords: (JSON.parse(m.matched_keywords) as string[]).join(', '),
      contratto: m.contratto_eol
        ? `${m.contratto_eol.contratto_nsm_id} (Grenke ${m.contratto_eol.contratto_grenke_id}${m.contratto_eol.data_scadenza ? `, scadenza ${m.contratto_eol.data_scadenza.toLocaleDateString('it-IT')}` : ''})`
        : null,
    })),
  });

  const oggetto = `Segnalazioni casella info@ — ${nuove.length} mail da gestire (${dataRome(adesso)})`;
  let inviiOk = 0;
  for (const dest of destinatari) {
    const r = await emailProvider.send(dest, oggetto, html, { cc: null });
    if (r.success) inviiOk++;
  }

  if (inviiOk > 0) {
    await prisma.monitoredEmail.updateMany({
      where: { id: { in: nuove.map(m => m.id) } },
      data: { status: 'NOTIFIED' },
    });
    await registraEvento(null, 'SISTEMA', 'MAIL_MONITOR', 'MONITOR_DIGEST_INVIATO', {
      segnalazioni: nuove.length,
      destinatari,
      invii_ok: inviiOk,
    });
    console.log(`[Monitor] Digest inviato: ${nuove.length} segnalazioni a ${inviiOk} destinatari`);
  }
  return { inviato: inviiOk > 0, segnalazioni: nuove.length };
}

/** Tick completo (chiamato ogni 15 minuti dallo scheduler o dal trigger esterno). */
export async function monitorTick(): Promise<{ poll: MonitorPollResult; digest: { inviato: boolean; segnalazioni: number; motivo?: string } }> {
  const poll = await pollMonitor();
  const digest = await inviaDigestSeDovuto();
  return { poll, digest };
}

/** Verifica credenziali e conta le mail in INBOX senza processarle (per il bottone in Impostazioni). */
export async function testConnessione(): Promise<{ ok: boolean; messaggi?: number; errore?: string }> {
  if (!imapConfigurato()) return { ok: false, errore: 'Credenziali IMAP non configurate (variabili MONITOR_IMAP_*)' };
  const client = nuovoClient();
  try {
    await client.connect();
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    const totale = box.exists;
    await client.logout();
    return { ok: true, messaggi: totale };
  } catch (err) {
    try { await client.logout(); } catch { /* già chiusa */ }
    return { ok: false, errore: err instanceof Error ? err.message : String(err) };
  }
}
