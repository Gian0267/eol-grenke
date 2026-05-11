import nodemailer from 'nodemailer';

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<SendResult>;
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
}
