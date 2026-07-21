/**
 * Imposta il CC fisso per tutte le comunicazioni verso i clienti (email e PEC).
 *
 * Il valore vive in Impostazioni (chiave email.cc_fisso) ed è letto dai
 * provider a ogni invio: vuoto = nessun CC. Esclusi per design: mail OTP,
 * digest/alert del monitor, ambiente TEST.
 *
 * Uso: npx tsx --env-file=backend/.env backend/scripts/imposta-cc-fisso.ts
 * ATTENZIONE: il DB è quello di produzione (condiviso dev/live). Eseguire
 * DOPO il deploy del codice che legge la chiave.
 */
import { prisma } from '../src/lib/db.js';

const CC = 'info@noleggiosumisura.it';

const esistente = await prisma.impostazione.findUnique({ where: { chiave: 'email.cc_fisso' } });
await prisma.impostazione.upsert({
  where: { chiave: 'email.cc_fisso' },
  update: { valore: CC },
  create: {
    chiave: 'email.cc_fisso',
    valore: CC,
    tipo: 'TESTO',
    categoria: 'email',
    label: 'CC fisso comunicazioni clienti',
    descrizione: 'Indirizzo in CC su tutte le comunicazioni ai clienti (email e PEC). Vuoto = nessun CC. Esclusi: OTP, mail interne monitor, ambiente TEST.',
    valore_default: '',
  },
});
console.log(`email.cc_fisso: ${esistente ? `aggiornata (era "${esistente.valore}")` : 'creata'} → ${CC}`);
await prisma.$disconnect();
