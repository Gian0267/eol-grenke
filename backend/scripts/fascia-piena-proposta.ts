/**
 * Estende il fondo blu notte dietro al banner della proposta di nuovo
 * noleggio.
 *
 * Negli altri template la fascia e' una riga di tabella larga quanto la
 * finestra; qui il testo e' stato riscritto dal pannello ed e' fatto di soli
 * paragrafi, quindi il banner era un'immagine larga 600 con il bianco intorno.
 * Un contenitore con il fondo del banner risolve senza rifare il template.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/fascia-piena-proposta.ts
 *   npx tsx --env-file=backend/.env backend/scripts/fascia-piena-proposta.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';

const FASCIA =
  '<div style="background-color:#14233c;text-align:center;padding:0;font-size:0;line-height:0;">' +
  '<img src="https://eol.noleggiosumisura.it/header-email.png" ' +
  'alt="Noleggio Su Misura - a brand of Integra Systems" width="600" ' +
  'style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto;"></div>';

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('background-color:#14233c')) {
    console.log(`${CHIAVE}: la fascia c'e' gia'.`);
    return;
  }

  const banner = /<p>\s*<img[^>]*header-email\.png[^>]*>\s*<\/p>/i;
  if (!banner.test(riga.valore)) {
    console.log(`${CHIAVE}: non trovo il banner da avvolgere — va sistemato a mano dal pannello.`);
    return;
  }

  const nuovo = riga.valore.replace(banner, FASCIA);
  console.log(`${CHIAVE}: fascia estesa dietro al banner.`);
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
