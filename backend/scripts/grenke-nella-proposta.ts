/**
 * Nomina Grenke Italia accanto al numero di contratto nella proposta di nuovo
 * noleggio salvata a database (la riga riscritta dal pannello).
 *
 *   npx tsx --env-file=backend/.env backend/scripts/grenke-nella-proposta.ts
 *   npx tsx --env-file=backend/.env backend/scripts/grenke-nella-proposta.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';
const ANCORA = /n\.\s*<strong>\{\{numero_contratto_grenke\}\}<\/strong>/;

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('Grenke Italia')) {
    console.log(`${CHIAVE}: Grenke Italia c'e' gia'.`);
    return;
  }
  if (!ANCORA.test(riga.valore)) {
    console.log(`${CHIAVE}: non trovo il numero di contratto — va aggiunto a mano dal pannello.`);
    return;
  }

  const nuovo = riga.valore.replace(ANCORA, (m) => `${m} con <strong>Grenke Italia</strong>`);
  console.log(`${CHIAVE}: aggiunto "con Grenke Italia" accanto al numero di contratto.`);
  if (esegui) {
    await prisma.impostazione.update({ where: { chiave: CHIAVE }, data: { valore: nuovo } });
    console.log('Impostazione aggiornata.');
  } else {
    console.log('Prova a vuoto — rilancia con --esegui per scrivere.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
