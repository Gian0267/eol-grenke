/**
 * Mette il pulsante "La richiamiamo" nella proposta di nuovo noleggio salvata
 * a database, al posto del solo indirizzo email da copiare a mano.
 *
 * La riga e' stata riscritta dal pannello, quindi si sostituisce solo il
 * paragrafo che riguarda il consulente, lasciando intatto il resto.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/pulsante-assistenza-proposta.ts
 *   npx tsx --env-file=backend/.env backend/scripts/pulsante-assistenza-proposta.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';

const NUOVO =
  '<p>{{#if link_assistenza}}</p>' +
  '<p>Preferisce essere seguito da un nostro consulente?</p>' +
  '<p><a target="_blank" href="{{{link_assistenza}}}"><strong>Clicchi qui e La richiamiamo</strong></a></p>' +
  '<p>Oppure scriva a <a target="_blank" href="mailto:{{email_nuovo_noleggio}}">{{email_nuovo_noleggio}}</a>.</p>' +
  '<p>{{else}}</p>' +
  '<p>Preferisce essere seguito da un nostro consulente? Scriva a ' +
  '<a target="_blank" href="mailto:{{email_nuovo_noleggio}}">{{email_nuovo_noleggio}}</a> ' +
  'indicando i Suoi dati e la ricontatteremo.</p>' +
  '<p>{{/if}}</p>';

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('link_assistenza')) {
    console.log(`${CHIAVE}: il pulsante c'e' gia'.`);
    return;
  }

  // Il paragrafo del consulente, come lo ha lasciato il pannello.
  const vecchio = /<p>\s*Preferisce essere seguito[\s\S]*?<\/p>/i;
  if (!vecchio.test(riga.valore)) {
    console.log(
      `${CHIAVE}: non trovo il paragrafo del consulente.\n` +
        'Il testo è stato riscritto ancora: il pulsante va messo a mano dal pannello.',
    );
    return;
  }

  const nuovo = riga.valore.replace(vecchio, NUOVO);
  console.log(`${CHIAVE}: paragrafo sostituito con il pulsante.`);
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
