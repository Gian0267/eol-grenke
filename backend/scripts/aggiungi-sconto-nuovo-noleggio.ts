/**
 * Impostazioni dello sconto sul riscatto per chi attiva un nuovo noleggio.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-sconto-nuovo-noleggio.ts
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-sconto-nuovo-noleggio.ts --esegui
 */
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');

const RIGHE = [
  {
    chiave: 'sconto_nuovo_noleggio.percentuale', valore: '15', tipo: 'NUMERO', categoria: 'PRICING',
    label: 'Sconto riscatto per nuovo noleggio (%)',
    descrizione: 'Sconto sul prezzo di riscatto per il cliente che ordina un nuovo noleggio e lo riceve entro la data limite. Non si applica ai prezzi concordati a mano e non scende mai sotto il costo Grenke',
  },
  {
    chiave: 'sconto_nuovo_noleggio.giorni_minimi', valore: '30', tipo: 'NUMERO', categoria: 'PRICING',
    label: 'Sconto nuovo noleggio: margine minimo (giorni)',
    descrizione: 'La data limite e\' la fine del mese che si chiude almeno questi giorni prima della scadenza. Con 30, un contratto in scadenza il 01/01 ha come limite il 30/11',
  },
  {
    chiave: 'flags.abilita_sconto_nuovo_noleggio', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS',
    label: 'Sconto riscatto per nuovo noleggio',
    descrizione: 'Se attivo, le comunicazioni propongono lo sconto sul riscatto a chi attiva un nuovo noleggio entro la data limite, e lo sconto viene applicato al prezzo',
  },
];

async function main() {
  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');
  for (const r of RIGHE) {
    const esistente = await prisma.impostazione.findUnique({ where: { chiave: r.chiave } });
    if (esistente) { console.log(`  = ${r.chiave}: gia' presente ("${esistente.valore}")`); continue; }
    console.log(`  + ${r.chiave} = ${r.valore}`);
    if (ESEGUI) await prisma.impostazione.create({ data: { ...r, valore_default: r.valore } });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
