/**
 * Scrive la password PEC nelle Impostazioni (chiave pec.password), letta dal
 * PEC_PASSWORD dell'ambiente locale (backend/.env — valore verificato su
 * Aruba). Il provider PEC la preferisce alla variabile d'ambiente del server:
 * rimedio al valore corrotto su hPanel (21/07/2026). Riga marcata NASCOSTA
 * per non esporla nella UI Impostazioni.
 *
 * Uso: npx tsx --env-file=backend/.env backend/scripts/imposta-pec-password-db.ts
 */
import { prisma } from '../src/lib/db.js';

const pw = (process.env.PEC_PASSWORD || '').trim();
if (!pw) {
  console.error('PEC_PASSWORD non presente nell\'ambiente locale');
  process.exit(1);
}

await prisma.impostazione.upsert({
  where: { chiave: 'pec.password' },
  update: { valore: pw },
  create: {
    chiave: 'pec.password',
    valore: pw,
    tipo: 'NASCOSTA',
    categoria: 'email',
    label: 'Password PEC (app password Aruba)',
    descrizione: 'Password SMTP della casella PEC. Se valorizzata ha priorità sulla variabile d\'ambiente PEC_PASSWORD.',
    valore_default: '',
  },
});
console.log(`pec.password scritta a DB (${pw.length} caratteri)`);
await prisma.$disconnect();
