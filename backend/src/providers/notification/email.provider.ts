import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendOpts {
  /**
   * Indirizzo in copia conoscenza. Non passato (undefined) → si applica il CC
   * predefinito da Impostazioni (email.cc_fisso); null o '' → nessun CC
   * (usato per OTP, mail interne del monitor e ambiente TEST).
   */
  cc?: string | null;
}

export interface EmailProvider {
  send(to: string, subject: string, html: string, opts?: SendOpts): Promise<SendResult>;
  sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[], opts?: SendOpts): Promise<SendResult>;
}

/** CC predefinito per le comunicazioni verso i clienti (Impostazioni → email.cc_fisso). */
async function ccPredefinito(): Promise<string> {
  try {
    const configService = await import('../../services/config.service.js');
    return (await configService.getTesto('email.cc_fisso', '')).trim();
  } catch {
    return '';
  }
}

/** Risolve il CC effettivo per un invio: default da Impostazioni, esclusioni esplicite via opts. */
async function risolviCc(opts?: SendOpts): Promise<string | undefined> {
  const cc = opts?.cc === undefined ? await ccPredefinito() : opts.cc;
  return cc ? cc : undefined;
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    this.from = process.env.SMTP_FROM || 'Noleggio Su Misura <info@noleggiosumisura.it>';
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async send(to: string, subject: string, html: string, opts?: SendOpts): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        cc: await risolviCc(opts),
        subject,
        html,
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EmailProvider] Errore invio a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[], opts?: SendOpts): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        cc: await risolviCc(opts),
        subject,
        html,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EmailProvider] Errore invio con allegato a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }
}

/**
 * Provider basato su Resend (https://resend.com).
 * Usato in produzione quando RESEND_API_KEY è configurato.
 * Il mittente (RESEND_FROM) deve appartenere a un dominio verificato su Resend.
 */
export class ResendEmailProvider implements EmailProvider {
  private resend: Resend;
  private from: string;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.from =
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      'Noleggio Su Misura <info@noleggiosumisura.it>';
  }

  async send(to: string, subject: string, html: string, opts?: SendOpts): Promise<SendResult> {
    try {
      const cc = await risolviCc(opts);
      const { data, error } = await this.resend.emails.send({ from: this.from, to, ...(cc ? { cc } : {}), subject, html });
      if (error) {
        console.error(`[Resend] Errore invio a ${to}: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Resend] Errore invio a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[], opts?: SendOpts): Promise<SendResult> {
    try {
      const cc = await risolviCc(opts);
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        ...(cc ? { cc } : {}),
        subject,
        html,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
      });
      if (error) {
        console.error(`[Resend] Errore invio con allegato a ${to}: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Resend] Errore invio con allegato a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }
}

/**
 * Provider PEC (Posta Elettronica Certificata) via SMTP del provider certificato.
 * Valore legale solo PEC→PEC. Il mittente DEVE coincidere con la casella autenticata.
 * Default: parametri Aruba PEC (smtps.pec.aruba.it:465).
 */
/**
 * Password PEC: prima Impostazioni (pec.password), poi variabile d'ambiente.
 * La via DB esiste perché il 21/07/2026 il valore incollato su hPanel arrivava
 * sistematicamente corrotto (17 caratteri anziché 16 → 535 da Aruba) e non
 * c'era modo di correggerlo dal pannello.
 */
export async function pecPassword(): Promise<{ password: string; sorgente: 'impostazioni' | 'env' }> {
  try {
    const configService = await import('../../services/config.service.js');
    const fromDb = (await configService.getTesto('pec.password', '')).trim();
    if (fromDb) return { password: fromDb, sorgente: 'impostazioni' };
  } catch { /* config non disponibile: si ricade sull'env */ }
  return { password: process.env.PEC_PASSWORD || '', sorgente: 'env' };
}

export class PecEmailProvider implements EmailProvider {
  private from: string;

  constructor() {
    this.from = process.env.PEC_FROM || process.env.PEC_USER || '';
  }

  // Transporter creato a ogni invio: la password può arrivare dalle
  // Impostazioni (asincrone) e può cambiare senza riavvio dell'app
  private async transporter(): Promise<nodemailer.Transporter> {
    const port = Number(process.env.PEC_SMTP_PORT || 465);
    const { password } = await pecPassword();
    return nodemailer.createTransport({
      host: process.env.PEC_SMTP_HOST || 'smtps.pec.aruba.it',
      port,
      secure: port === 465, // 465 = SMTPS; 587 = STARTTLS
      auth: {
        user: process.env.PEC_USER,
        pass: password,
      },
    });
  }

  async send(to: string, subject: string, html: string, opts?: SendOpts): Promise<SendResult> {
    try {
      // Il CC su una casella ordinaria riceve una copia senza valore legale
      const t = await this.transporter();
      const info = await t.sendMail({ from: this.from, to, cc: await risolviCc(opts), subject, html });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PEC] Errore invio a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[], opts?: SendOpts): Promise<SendResult> {
    try {
      const t = await this.transporter();
      const info = await t.sendMail({
        from: this.from,
        to,
        cc: await risolviCc(opts),
        subject,
        html,
        attachments: attachments.map(a => ({ filename: a.filename, content: a.content })),
      });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PEC] Errore invio con allegato a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }
}

/**
 * SOLO PER LA FASE DI TEST — da rimuovere prima della produzione effettiva.
 *
 * Wrapper che reindirizza ogni invio a un'unica casella di test, prefissando
 * l'oggetto con "(mail cliente)" o "(pec cliente)" così dal soggetto si
 * capisce quale canale è stato simulato. In cima al corpo viene aggiunto un
 * banner col destinatario originale.
 */
export class TestRedirectEmailProvider implements EmailProvider {
  constructor(
    private inner: EmailProvider,
    private redirectTo: string | (() => Promise<string>),
    private prefix: string,
  ) {}

  private resolveTo(): Promise<string> {
    return typeof this.redirectTo === 'function' ? this.redirectTo() : Promise.resolve(this.redirectTo);
  }

  private banner(originalTo: string): string {
    return (
      `<div style="background:#fef3c7;border:1px dashed #f59e0b;padding:8px 12px;` +
      `margin-bottom:16px;font-size:12px;color:#92400e;font-family:sans-serif;">` +
      `MODALITÀ TEST ${this.prefix} — destinatario originale: <strong>${originalTo}</strong></div>`
    );
  }

  // cc: null — le mail di test non vanno mai in copia alla casella aziendale
  async send(to: string, subject: string, html: string): Promise<SendResult> {
    return this.inner.send(await this.resolveTo(), `${this.prefix} ${subject}`, this.banner(to) + html, { cc: null });
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult> {
    return this.inner.sendWithAttachment(await this.resolveTo(), `${this.prefix} ${subject}`, this.banner(to) + html, attachments, { cc: null });
  }
}

let _base: EmailProvider | null = null;
function baseEmailProvider(): EmailProvider {
  if (_base) return _base;
  if (process.env.RESEND_API_KEY) {
    console.log('[Email] Provider attivo: Resend');
    _base = new ResendEmailProvider();
  } else {
    console.log('[Email] Provider attivo: SMTP (Mailpit/dev)');
    _base = new SmtpEmailProvider();
  }
  return _base;
}

/** Casella di raccolta delle mail dell'ambiente TEST (Impostazioni → test.email_redirect). */
async function testRedirectAddress(): Promise<string> {
  const configService = await import('../../services/config.service.js');
  const fromDb = await configService.getTesto('test.email_redirect', '');
  return fromDb || process.env.TEST_MAIL_REDIRECT || 'g.ciardo@gmail.com';
}

let _testEmail: EmailProvider | null = null;
let _testPec: EmailProvider | null = null;

/**
 * Provider email in base all'ambiente della PRATICA: le pratiche TEST hanno
 * le mail sempre reindirizzate alla casella di test (a prescindere dalla
 * variabile globale TEST_MAIL_REDIRECT); le pratiche LIVE inviano davvero.
 */
export function emailProviderPerAmbiente(ambiente?: string | null): EmailProvider {
  if (ambiente === 'TEST') {
    if (!_testEmail) _testEmail = new TestRedirectEmailProvider(baseEmailProvider(), testRedirectAddress, '(mail cliente)');
    return _testEmail;
  }
  return createEmailProvider();
}

/**
 * Provider PEC in base all'ambiente della PRATICA: per le pratiche TEST la
 * PEC è simulata via email ordinaria verso la casella di test (zero PEC Aruba
 * consumate); per le pratiche LIVE si usa la PEC reale se configurata.
 */
export function pecProviderPerAmbiente(ambiente?: string | null): EmailProvider | null {
  if (ambiente === 'TEST') {
    if (!_testPec) _testPec = new TestRedirectEmailProvider(baseEmailProvider(), testRedirectAddress, '(pec cliente)');
    return _testPec;
  }
  return createPecProvider();
}

/**
 * Factory: sceglie il provider email in base all'ambiente.
 *  - Resend  → se RESEND_API_KEY è configurato (produzione)
 *  - SMTP    → fallback (Mailpit in sviluppo)
 *
 * SOLO TEST: se TEST_MAIL_REDIRECT è impostata, ogni invio viene reindirizzato
 * a quella casella con oggetto prefissato "(mail cliente)".
 */
export function createEmailProvider(): EmailProvider {
  const provider = baseEmailProvider();
  const redirect = process.env.TEST_MAIL_REDIRECT;
  if (redirect) {
    console.log(`[Email] MODALITÀ TEST: tutte le email reindirizzate a ${redirect}`);
    return new TestRedirectEmailProvider(provider, redirect, '(mail cliente)');
  }
  return provider;
}

/** True se la casella PEC è configurata (credenziali presenti). */
export function isPecConfigured(): boolean {
  return Boolean(process.env.PEC_USER && process.env.PEC_PASSWORD);
}

/**
 * Factory PEC: restituisce il provider PEC se configurato, altrimenti null.
 * Quando null, il canale PEC ricade sul provider email normale (comportamento legacy).
 *
 * SOLO TEST: se TEST_MAIL_REDIRECT è impostata, il canale PEC NON usa Aruba —
 * simula l'invio con una email ordinaria reindirizzata alla casella di test,
 * con oggetto prefissato "(pec cliente)". Zero PEC reali consumate nei test.
 */
export function createPecProvider(): EmailProvider | null {
  const redirect = process.env.TEST_MAIL_REDIRECT;
  if (redirect) {
    console.log(`[PEC] MODALITÀ TEST: canale PEC simulato via email ordinaria verso ${redirect}`);
    return new TestRedirectEmailProvider(baseEmailProvider(), redirect, '(pec cliente)');
  }
  if (isPecConfigured()) {
    console.log('[PEC] Provider PEC attivo:', process.env.PEC_SMTP_HOST || 'smtps.pec.aruba.it');
    return new PecEmailProvider();
  }
  console.log('[PEC] Provider PEC non configurato — il canale PEC userà il provider email normale');
  return null;
}
