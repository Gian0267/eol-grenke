/**
 * Porta nelle righe DB dei template il riquadro dello sconto per nuovo noleggio.
 *
 * Il template vivo e' la riga `Impostazione`, non il file: senza questo passo
 * le comunicazioni continuerebbero a partire senza l'offerta.
 *
 * Si rifiuta di sovrascrivere una riga che qualcuno ha ritoccato dal pannello:
 * in quel caso lo dice e la lascia com'e'.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/rollout-sconto-nuovo-noleggio.ts
 *   npx tsx --env-file=backend/.env backend/scripts/rollout-sconto-nuovo-noleggio.ts --esegui
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE = [
  ['email.comunicazione_iniziale', 'comunicazione_iniziale.html'],
  ['email.comunicazione_iniziale_pec', 'comunicazione_iniziale_pec.html'],
  ['email.sollecito_1', 'sollecito_1.html'],
  ['email.sollecito_2', 'sollecito_2.html'],
  ['email.sollecito_3', 'sollecito_3.html'],
] as const;

async function main() {
  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');

  for (const [chiave, file] of TEMPLATE) {
    const nuovo = readFileSync(resolve(__dirname, '../../templates/email', file), 'utf-8');
    if (!nuovo.includes('sconto_attivo')) {
      console.log(`  !  ${chiave}: il file non contiene il riquadro, salto`);
      continue;
    }

    const riga = await prisma.impostazione.findUnique({ where: { chiave } });
    if (!riga) { console.log(`  !  ${chiave}: riga assente a database`); continue; }

    if (riga.valore.includes('sconto_attivo')) { console.log(`  =  ${chiave}: gia' aggiornata`); continue; }

    // Il file precedente e' il nuovo senza il blocco: se la riga DB non
    // coincide, qualcuno l'ha modificata dal pannello e non va sovrascritta.
    // Commenti HTML e spaziatura si ignorano: non arrivano al cliente, e
    // confrontarli farebbe fallire il controllo per un a capo.
    const senzaBlocco = nuovo.replace(/\s*\{\{#if sconto_attivo\}\}[\s\S]*?\{\{\/if\}\}\n/g, '\n');
    const normalizza = (v: string) => v.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
    if (normalizza(riga.valore) !== normalizza(senzaBlocco)) {
      console.log(`  ✗  ${chiave}: la riga DB differisce dal file anche al di la' del riquadro.`);
      console.log(`       Probabilmente e' stata modificata dal pannello: NON la tocco.`);
      continue;
    }

    console.log(`  +  ${chiave}: ${riga.valore.length} -> ${nuovo.length} caratteri`);
    if (ESEGUI) {
      await prisma.impostazione.update({
        where: { chiave },
        data: { valore: nuovo, valore_default: nuovo },
      });
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
