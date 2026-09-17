/**
 * Riallinea la riga DB `email.comunicazione_iniziale` al file del repo, da cui
 * e' stato tolto il riquadro "Le servono dei dispositivi nuovi?".
 *
 * Serve perche' il template vivo e' la riga nel database, non il file: finche'
 * non si aggiorna quella, la produzione continua a mandare il riquadro. Lo
 * script rifiuta di scrivere se la riga e' stata personalizzata dal pannello,
 * per non cancellare modifiche fatte a mano.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/rimuovi-proposta-noleggio-iniziale.ts
 *   npx tsx --env-file=backend/.env backend/scripts/rimuovi-proposta-noleggio-iniziale.ts --esegui
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const CHIAVE = 'email.comunicazione_iniziale';

async function main() {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../templates/email/comunicazione_iniziale.html');
  const nuovo = readFileSync(file, 'utf-8');

  if (nuovo.includes('cliente_iol')) {
    console.error('Il file contiene ancora il blocco cliente_iol: niente da propagare.');
    process.exit(1);
  }

  const riga = await prisma.impostazione.findUnique({ where: { chiave: CHIAVE } });
  if (!riga) { console.error(`Impostazione ${CHIAVE} assente.`); process.exit(1); }

  if (!riga.valore.includes('cliente_iol')) {
    console.log('La riga DB non contiene gia\' piu\' il blocco: niente da fare.');
    await prisma.$disconnect();
    return;
  }

  // Verifica che la riga DB sia il file di prima, riquadro a parte: se qualcuno
  // ha ritoccato il template dal pannello, sovrascriverlo cancellerebbe il suo
  // lavoro in silenzio. Il confronto NON usa valore_default, che su questa riga
  // e' fermo a prima del rebranding e segnalerebbe differenze inesistenti.
  const senzaBlocco = (() => {
    const i = riga.valore.indexOf('              <!-- Nuovo noleggio');
    if (i < 0) return riga.valore;
    const j = riga.valore.indexOf('{{/if}}', i) + '{{/if}}\n'.length;
    return (riga.valore.slice(0, j === -1 ? i : i) + riga.valore.slice(j)).replace(/\n{3,}/g, '\n\n');
  })();

  if (senzaBlocco !== nuovo) {
    console.error('ATTENZIONE: la riga DB differisce dal file anche al di la\' del riquadro.');
    console.error('Qualcuno l\'ha modificata dal pannello: non la sovrascrivo.');
    console.error(`  DB senza riquadro: ${senzaBlocco.length} caratteri | file: ${nuovo.length}`);
    process.exit(1);
  }

  console.log(`${CHIAVE}: ${riga.valore.length} caratteri -> ${nuovo.length} (via il riquadro Italiaonline)`);
  if (riga.valore_default.includes('Smartcom Solutions')) {
    console.log('  valore_default era fermo a prima del rebranding (diceva "Smartcom Solutions Srl"):');
    console.log('  lo riallineo, altrimenti il pulsante "Default" del pannello rimetterebbe il vecchio nome.');
  }
  if (!ESEGUI) {
    console.log('\n(prova a vuoto — aggiungi --esegui per scrivere)');
    await prisma.$disconnect();
    return;
  }

  await prisma.impostazione.update({
    where: { chiave: CHIAVE },
    data: { valore: nuovo, valore_default: nuovo },
  });
  console.log('Riga aggiornata.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
