/**
 * Aggiunge il richiamo allo sconto alla proposta di nuovo noleggio salvata a
 * database.
 *
 * Questa riga e' stata riscritta dal pannello Impostazioni e non corrisponde
 * piu' al file: sovrascriverla cancellerebbe quel lavoro. Qui si inserisce solo
 * il paragrafo mancante, nello stesso stile del resto, subito prima dell'invito
 * a farsi seguire da un consulente.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/sconto-nella-proposta.ts
 *   npx tsx --env-file=backend/.env backend/scripts/sconto-nella-proposta.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const CHIAVE = 'email.proposta_nuovo_noleggio';

const BLOCCO =
  '<p>{{#if sconto_attivo}}</p>' +
  '<p><strong>E c&rsquo;&egrave; un vantaggio in pi&ugrave;.</strong> ' +
  'Se il nuovo contratto viene approvato dalla finanziaria e da Lei firmato entro il ' +
  '<strong>{{sconto_data_limite}}</strong>, il prezzo di acquisto dei beni che ha attualmente ' +
  'in locazione scende del {{sconto_percentuale}}%: da <strong>&euro; {{pricing_riacquisto}}</strong> ' +
  'a <strong>&euro; {{prezzo_riacquisto_scontato}}</strong>, con un risparmio di ' +
  '<strong>&euro; {{sconto_euro}}</strong>.</p>' +
  '<p>{{/if}}</p>';

async function main() {
  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga?.valore) {
    console.log(`${CHIAVE}: riga non trovata.`);
    return;
  }
  if (riga.valore.includes('sconto_attivo')) {
    console.log(`${CHIAVE}: il richiamo allo sconto c'e' gia'.`);
    return;
  }

  const ancora = '<p>Preferisce essere seguito';
  const i = riga.valore.indexOf(ancora);
  if (i === -1) {
    console.log(
      `${CHIAVE}: non trovo dove inserire il paragrafo (cercavo "${ancora}").\n` +
        'Il testo è stato riscritto ancora: va aggiunto a mano dal pannello.',
    );
    return;
  }

  const nuovo = riga.valore.slice(0, i) + BLOCCO + riga.valore.slice(i);
  console.log(`${CHIAVE}: paragrafo inserito prima di "${ancora}…"`);
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
