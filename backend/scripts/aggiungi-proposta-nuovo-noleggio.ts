/**
 * Crea le impostazioni della comunicazione "Proposta di nuovo noleggio".
 *
 * Il template vivo e' la riga DB, non il file: senza questo script la pagina
 * di invio userebbe il fallback su disco e le modifiche fatte dal pannello non
 * avrebbero dove appoggiarsi.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-proposta-nuovo-noleggio.ts
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-proposta-nuovo-noleggio.ts --esegui
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const html = readFileSync(resolve(__dirname, '../../templates/email/proposta_nuovo_noleggio.html'), 'utf-8');

  const righe = [
    {
      chiave: 'email.proposta_nuovo_noleggio',
      valore: html,
      tipo: 'HTML',
      categoria: 'EMAIL',
      label: 'Proposta di nuovo noleggio',
      descrizione: 'Comunicazione commerciale a se stante, inviata a mano dal backoffice ai clienti Italiaonline: propone di attivare un nuovo noleggio a prescindere dalla decisione di fine contratto',
    },
    {
      chiave: 'email.proposta_nuovo_noleggio_oggetto',
      valore: 'Dispositivi nuovi per la Sua azienda',
      tipo: 'TESTO',
      categoria: 'EMAIL',
      label: 'Oggetto proposta nuovo noleggio',
      descrizione: 'Oggetto della mail di proposta commerciale',
    },
  ];

  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');
  for (const r of righe) {
    const esistente = await prisma.impostazione.findUnique({ where: { chiave: r.chiave } });
    if (esistente) {
      console.log(`  = ${r.chiave}: gia' presente (${esistente.valore.length} caratteri), lasciata invariata`);
      continue;
    }
    console.log(`  + ${r.chiave} (${r.valore.length} caratteri)`);
    if (ESEGUI) await prisma.impostazione.create({ data: { ...r, valore_default: r.valore } });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
