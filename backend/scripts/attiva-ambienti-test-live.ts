/**
 * Script di rollout — Ambienti Test/Live.
 *
 * La migrazione Prisma (colonna `ambiente` + backfill di tutto l'esistente a
 * TEST) è già applicata. Questo script aggiunge l'unica Impostazione nuova:
 *
 *  - test.email_redirect: casella che raccoglie TUTTE le email/PEC generate
 *    dalle pratiche in ambiente TEST (le pratiche LIVE inviano davvero).
 *    Modificabile da Impostazioni → Recapiti.
 *
 * Va eseguito DOPO il deploy del codice.
 *
 * Esecuzione (dalla cartella del progetto):
 *   npx tsx --env-file=backend/.env backend/scripts/attiva-ambienti-test-live.ts
 */
import { prisma } from '../src/lib/db.js';

async function main() {
  console.log('=== Ambienti Test/Live ===\n');

  await prisma.impostazione.upsert({
    where: { chiave: 'test.email_redirect' },
    update: {},
    create: {
      chiave: 'test.email_redirect',
      valore: 'g.ciardo@gmail.com',
      valore_default: 'g.ciardo@gmail.com',
      tipo: 'TESTO',
      categoria: 'RECAPITI',
      label: 'Casella raccolta mail ambiente Test',
      descrizione: 'Tutte le email/PEC generate dalle pratiche in ambiente TEST vengono reindirizzate a questa casella (le pratiche LIVE inviano davvero)',
    },
  });
  console.log('✅ test.email_redirect configurata');

  const contratti = await prisma.contratto_EOL.groupBy({ by: ['ambiente'], _count: true });
  console.log('Contratti per ambiente:', JSON.stringify(contratti));

  console.log('\nFatto. Selettore Test/Live in sidebar (ADMIN e Backoffice interno), default LIVE.');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
