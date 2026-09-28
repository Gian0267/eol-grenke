/**
 * Crea l'impostazione del link di registrazione generico.
 *
 * Serve quando la pratica non ha un'agenzia, o l'agenzia non ha ancora un link
 * suo: prima in quei casi l'offerta del nuovo noleggio non partiva affatto.
 * Il valore di partenza e' quello gia' usato per i clienti Italiaonline, che e'
 * il link della casa e non di un agente in particolare.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-link-generico.ts
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-link-generico.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'link_nuovo_noleggio_generico';

async function main() {
  const gia = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (gia) {
    console.log(`${CHIAVE} esiste gia':\n  ${gia.valore}`);
    return;
  }

  const iol = await prisma.impostazione.findUnique({ where: { chiave: 'iol.link_nuovo_noleggio' } });
  const valore = (iol?.valore ?? 'https://app.noleggiosumisura.it/start').trim();
  console.log(`${CHIAVE} da creare con:\n  ${valore}`);

  if (!esegui) {
    console.log('\nProva a vuoto — rilancia con --esegui per scrivere.');
    return;
  }

  await prisma.impostazione.create({
    data: {
      chiave: CHIAVE,
      valore,
      valore_default: valore,
      tipo: 'TESTO',
      categoria: 'RECAPITI',
      label: 'Link nuovo noleggio (generico)',
      descrizione: "Usato quando la pratica non ha un'agenzia, o l'agenzia non ha ancora un link suo",
    },
  });
  console.log('Creata.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
