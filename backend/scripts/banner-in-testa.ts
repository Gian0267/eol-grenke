/**
 * Mette il banner di intestazione nella proposta di nuovo noleggio salvata a
 * database: negli altri template arriva dal file, questa riga e' stata
 * riscritta dal pannello e va toccata a parte.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/banner-in-testa.ts
 *   npx tsx --env-file=backend/.env backend/scripts/banner-in-testa.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';

const BANNER =
  '<p><img src="https://eol.noleggiosumisura.it/header-email.png" ' +
  'alt="Noleggio Su Misura - a brand of Integra Systems" width="600" ' +
  'style="display:block;width:100%;max-width:600px;height:auto;border:0;"></p>';

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('header-email.png')) {
    console.log(`${CHIAVE}: il banner c'e' gia'.`);
    return;
  }

  const vecchio = /<p>\s*<img[^>]*nsm-logo\.png[^>]*>\s*<\/p>/i;
  if (!vecchio.test(riga.valore)) {
    console.log(`${CHIAVE}: non trovo il logo da sostituire — va messo a mano dal pannello.`);
    return;
  }

  const nuovo = riga.valore.replace(vecchio, BANNER);
  console.log(`${CHIAVE}: logo sostituito con il banner.`);
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
