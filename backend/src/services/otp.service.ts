import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/db.js';
import { createEmailProvider } from '../providers/notification/email.provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const featureFlags = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/feature_flags.json'), 'utf-8'),
);
const OTP_VALIDITY_MINUTES = 10;
const TEST_CODE = '123456';

const emailProvider = createEmailProvider();

function randomSixDigits(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpEmailHtml(codice: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color: #1a3a52; margin-bottom: 8px;">Codice di verifica</h2>
    <p style="color: #475569; font-size: 14px;">Usa questo codice per confermare la tua scelta sulla piattaforma Noleggio Su Misura:</p>
    <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
      <span style="font-size: 34px; font-weight: 700; letter-spacing: 10px; color: #1a3a52;">${codice}</span>
    </div>
    <p style="color: #64748b; font-size: 12px;">Il codice è valido per ${OTP_VALIDITY_MINUTES} minuti. Se non hai richiesto tu questo codice, ignora questa email.</p>
  </div>`;
}

export async function generateOtp(
  metodo: 'SMS' | 'EMAIL',
  destinatario: string,
): Promise<{ codice: string }> {
  const codice = randomSixDigits();
  const scadenza = new Date(Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: { destinatario, codice, metodo, scadenza },
  });

  // Invio reale: via email se il destinatario è un indirizzo email (il canale
  // SMS non ha ancora un provider — quando il destinatario è un numero di
  // telefono il codice resta solo a DB e va integrato un provider SMS).
  if (destinatario.includes('@')) {
    const result = await emailProvider.send(
      destinatario,
      'Il tuo codice di verifica — Noleggio Su Misura',
      otpEmailHtml(codice),
    );
    if (!result.success) {
      console.error('[OTP] Invio email fallito:', result.error);
    }
  } else {
    console.warn('[OTP] Provider SMS non integrato — codice generato ma non recapitato a', destinatario.substring(0, 3) + '***');
  }

  console.log('[OTP] Codice generato per:', destinatario.substring(0, 3) + '***');

  return { codice };
}

export async function verifyOtp(
  metodo: 'SMS' | 'EMAIL',
  destinatario: string,
  codice: string,
): Promise<{ valid: boolean; errore?: string }> {
  if (process.env.NODE_ENV !== 'production' && featureFlags.modalita_test && codice === TEST_CODE) {
    return { valid: true };
  }

  const otp = await prisma.otpCode.findFirst({
    where: { destinatario, metodo, codice, usato: false },
    orderBy: { created_at: 'desc' },
  });

  if (!otp) {
    return { valid: false, errore: 'Codice OTP non valido' };
  }

  if (new Date() > otp.scadenza) {
    return { valid: false, errore: 'Codice scaduto, richiedine uno nuovo' };
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usato: true },
  });

  return { valid: true };
}
