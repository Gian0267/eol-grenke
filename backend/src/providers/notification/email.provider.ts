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

export interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<SendResult>;
  sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult>;
}

export class SmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    this.from = process.env.SMTP_FROM || 'Noleggio Su Misura <noreply@noleggiosumisura.it>';
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async send(to: string, subject: string, html: string): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
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

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
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
      'Noleggio Su Misura <noreply@noleggiosumisura.it>';
  }

  async send(to: string, subject: string, html: string): Promise<SendResult> {
    try {
      const { data, error } = await this.resend.emails.send({ from: this.from, to, subject, html });
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

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
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
export class PecEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    const port = Number(process.env.PEC_SMTP_PORT || 465);
    this.from = process.env.PEC_FROM || process.env.PEC_USER || '';
    this.transporter = nodemailer.createTransport({
      host: process.env.PEC_SMTP_HOST || 'smtps.pec.aruba.it',
      port,
      secure: port === 465, // 465 = SMTPS; 587 = STARTTLS
      auth: {
        user: process.env.PEC_USER,
        pass: process.env.PEC_PASSWORD,
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({ from: this.from, to, subject, html });
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PEC] Errore invio a ${to}: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
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
    private redirectTo: string,
    private prefix: string,
  ) {}

  private banner(originalTo: string): string {
    return (
      `<div style="background:#fef3c7;border:1px dashed #f59e0b;padding:8px 12px;` +
      `margin-bottom:16px;font-size:12px;color:#92400e;font-family:sans-serif;">` +
      `MODALITÀ TEST ${this.prefix} — destinatario originale: <strong>${originalTo}</strong></div>`
    );
  }

  send(to: string, subject: string, html: string): Promise<SendResult> {
    return this.inner.send(this.redirectTo, `${this.prefix} ${subject}`, this.banner(to) + html);
  }

  sendWithAttachment(to: string, subject: string, html: string, attachments: EmailAttachment[]): Promise<SendResult> {
    return this.inner.sendWithAttachment(this.redirectTo, `${this.prefix} ${subject}`, this.banner(to) + html, attachments);
  }
}

function baseEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) {
    console.log('[Email] Provider attivo: Resend');
    return new ResendEmailProvider();
  }
  console.log('[Email] Provider attivo: SMTP (Mailpit/dev)');
  return new SmtpEmailProvider();
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
