import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const featureFlags = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/feature_flags.json'), 'utf-8'),
);
const OTP_VALIDITY_MINUTES = 10;
const TEST_CODE = '123456';

function randomSixDigits(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

  console.log('[OTP] Codice inviato a:', destinatario.substring(0, 3) + '***');

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
