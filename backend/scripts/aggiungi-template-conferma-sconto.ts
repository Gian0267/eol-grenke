/**
 * Riga DB del template "Conferma sconto sul riscatto" + suo oggetto, e rollout
 * dei template della quarta opzione (il link diretto alla piattaforma e' stato
 * sostituito dal rimando all'area riservata).
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-template-conferma-sconto.ts
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-template-conferma-sconto.ts --esegui
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const __dirname = dirname(fileURLToPath(import.meta.url));
const leggi = (f: string) => readFileSync(resolve(__dirname, '../../templates/email', f), 'utf-8');

async function main() {
  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');

  // 1) Nuove righe
  const nuove = [
    {
      chiave: 'email.conferma_sconto_riscatto', valore: leggi('conferma_sconto_riscatto.html'),
      tipo: 'HTML', categoria: 'EMAIL', label: 'Conferma sconto sul riscatto',
      descrizione: 'Inviata al cliente quando il backoffice conferma la spedizione del nuovo noleggio: comunica il prezzo ridotto',
    },
    {
      chiave: 'email.conferma_sconto_riscatto_oggetto', valore: 'Sconto confermato sul riscatto dei Suoi dispositivi',
      tipo: 'TESTO', categoria: 'EMAIL', label: 'Oggetto conferma sconto',
      descrizione: 'Oggetto della mail di conferma dello sconto',
    },
  ];
  for (const r of nuove) {
    const e = await prisma.impostazione.findUnique({ where: { chiave: r.chiave } });
    if (e) { console.log(`  = ${r.chiave}: gia' presente`); continue; }
    console.log(`  + ${r.chiave}`);
    if (ESEGUI) await prisma.impostazione.create({ data: { ...r, valore_default: r.valore } });
  }

  // 2) Template modificati: il link diretto non c'e' piu'
  const aggiornati: Array<[string, string]> = [
    ['email.comunicazione_iniziale', 'comunicazione_iniziale.html'],
    ['email.comunicazione_iniziale_pec', 'comunicazione_iniziale_pec.html'],
    ['email.sollecito_1', 'sollecito_1.html'],
    ['email.sollecito_2', 'sollecito_2.html'],
    ['email.sollecito_3', 'sollecito_3.html'],
  ];
  for (const [chiave, file] of aggiornati) {
    const nuovo = leggi(file);
    const riga = await prisma.impostazione.findUnique({ where: { chiave } });
    if (!riga) { console.log(`  ! ${chiave}: riga assente`); continue; }
    if (riga.valore === nuovo) { console.log(`  = ${chiave}: gia' allineata`); continue; }
    // La riga DB deve ancora contenere il link diretto: se non c'e', qualcuno
    // l'ha gia' cambiata a mano e non la si sovrascrive.
    if (!riga.valore.includes('link_nuovo_noleggio_sconto') && !riga.valore.includes('sconto_attivo')) {
      console.log(`  ✗ ${chiave}: non riconosco la versione a database, NON la tocco`);
      continue;
    }
    console.log(`  ~ ${chiave}: ${riga.valore.length} -> ${nuovo.length} caratteri`);
    if (ESEGUI) await prisma.impostazione.update({ where: { chiave }, data: { valore: nuovo, valore_default: nuovo } });
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
