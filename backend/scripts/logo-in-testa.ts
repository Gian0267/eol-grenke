/**
 * Mette il logo Noleggio Su Misura in testa alla proposta di nuovo noleggio
 * salvata a database.
 *
 * Negli altri template il cambio arriva dal file; questa riga pero' e' stata
 * riscritta dal pannello Impostazioni, quindi va toccata a parte e con la
 * chirurgia: si sostituiscono solo il titolo e il sottotitolo, il resto del
 * testo riscritto resta dov'e'.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/logo-in-testa.ts
 *   npx tsx --env-file=backend/.env backend/scripts/logo-in-testa.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';

const LOGO =
  '<p><img src="https://eol.noleggiosumisura.it/nsm-logo.png" alt="Noleggio Su Misura" height="34" ' +
  'style="height:34px;border:0;"></p>';

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('nsm-logo.png')) {
    console.log(`${CHIAVE}: il logo c'e' gia'.`);
    return;
  }

  // Titolo e sottotitolo come li ha lasciati il pannello: un h1 e un paragrafo.
  const testata = /<h1>\s*<strong>\s*Integra Systems Srl\s*<\/strong>\s*<\/h1>\s*<p>\s*Noleggio Su Misura[^<]*<\/p>/i;
  if (!testata.test(riga.valore)) {
    console.log(
      `${CHIAVE}: non riconosco la testata da sostituire.\n` +
        'Il testo è stato riscritto ancora: il logo va messo a mano dal pannello.',
    );
    return;
  }

  const nuovo = riga.valore.replace(testata, LOGO);
  console.log(`${CHIAVE}: testata sostituita con il logo.`);
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
