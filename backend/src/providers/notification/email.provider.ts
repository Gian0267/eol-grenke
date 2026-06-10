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
 * Factory: sceglie il provider email in base all'ambiente.
 *  - Resend  → se RESEND_API_KEY è configurato (produzione)
 *  - SMTP    → fallback (Mailpit in sviluppo)
 */
export function createEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) {
    console.log('[Email] Provider attivo: Resend');
    return new ResendEmailProvider();
  }
  console.log('[Email] Provider attivo: SMTP (Mailpit/dev)');
  return new SmtpEmailProvider();
}

/** True se la casella PEC è configurata (credenziali presenti). */
export function isPecConfigured(): boolean {
  return Boolean(process.env.PEC_USER && process.env.PEC_PASSWORD);
}

/**
 * Factory PEC: restituisce il provider PEC se configurato, altrimenti null.
 * Quando null, il canale PEC ricade sul provider email normale (comportamento legacy).
 */
export function createPecProvider(): EmailProvider | null {
  if (isPecConfigured()) {
    console.log('[PEC] Provider PEC attivo:', process.env.PEC_SMTP_HOST || 'smtps.pec.aruba.it');
    return new PecEmailProvider();
  }
  console.log('[PEC] Provider PEC non configurato — il canale PEC userà il provider email normale');
  return null;
}
