/**
 * Introduce le mensilita' configurabili per il prezzo di riacquisto.
 *
 * Crea le due impostazioni (standard e Italiaonline) e rimuove
 * `pricing.riacquisto_percentuale`, che nessuna riga di codice leggeva piu':
 * lasciarla nel menu' Pricing accanto alle nuove manopole sarebbe una trappola.
 *
 * Le pratiche gia' in archivio NON vengono ricalcolate: i prezzi comunicati ai
 * clienti restano quelli. La regola vale dal prossimo import.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-mensilita-riacquisto.ts          # prova a vuoto
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-mensilita-riacquisto.ts --esegui # scrive
 */
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');

const NUOVE = [
  {
    chiave: 'pricing.mensilita_per_anno',
    valore: '1',
    tipo: 'NUMERO',
    categoria: 'PRICING',
    label: 'Mensilita per anno — standard',
    descrizione: 'Prezzo di riacquisto proposto al cliente = canone mensile x (mesi / 12) x mensilita. Vale per tutte le origini tranne Italiaonline. Es. 24 mesi a 100 euro/mese con 1 mensilita = 200 euro',
  },
  {
    chiave: 'pricing.mensilita_per_anno_iol',
    valore: '1.5',
    tipo: 'NUMERO',
    categoria: 'PRICING',
    label: 'Mensilita per anno — clienti Italiaonline',
    descrizione: 'Stessa formula, applicata alle pratiche il cui broker corrisponde alle "Diciture origine Italiaonline" (scheda Recapiti). Es. 18 mesi a 100 euro/mese con 1,5 mensilita = 225 euro',
  },
];

const DA_RIMUOVERE = ['pricing.riacquisto_percentuale'];

async function main() {
  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui per scrivere) ===\n');

  for (const imp of NUOVE) {
    const esistente = await prisma.impostazione.findUnique({ where: { chiave: imp.chiave } });
    if (esistente) {
      console.log(`  = ${imp.chiave}: gia' presente, valore attuale "${esistente.valore}" — lasciato invariato`);
      continue;
    }
    console.log(`  + ${imp.chiave} = ${imp.valore}`);
    if (ESEGUI) {
      await prisma.impostazione.create({ data: { ...imp, valore_default: imp.valore } });
    }
  }

  for (const chiave of DA_RIMUOVERE) {
    const esistente = await prisma.impostazione.findUnique({ where: { chiave } });
    if (!esistente) {
      console.log(`  = ${chiave}: gia' assente`);
      continue;
    }
    console.log(`  - ${chiave} (valore "${esistente.valore}", non letto da nessuna parte)`);
    if (ESEGUI) {
      await prisma.impostazione.delete({ where: { chiave } });
    }
  }

  // Riepilogo: quanto costerebbero oggi i contratti in archivio con le nuove
  // regole, per rendersi conto dello scarto prima di importare il prossimo file.
  const pratiche = await prisma.contratto_EOL.findMany({
    select: { origine: true, canone_mensile: true, numero_mesi: true, pricing_grenke: true, pricing_riacquisto: true },
  });
  if (pratiche.length > 0) {
    console.log('\nConfronto sulle pratiche esistenti (NESSUNA viene modificata):');
    for (const c of pratiche) {
      const iol = /italiaonline|iol/i.test((c.origine ?? '').replace(/[^a-zA-Z]/g, ''));
      const mens = iol ? 1.5 : 1;
      const nuovo = Number(c.canone_mensile) * (c.numero_mesi / 12) * mens;
      console.log(
        `  ${(c.origine ?? '—').slice(0, 22).padEnd(23)} ${String(c.numero_mesi).padStart(2)}m` +
        `  oggi ${Number(c.pricing_riacquisto).toFixed(2).padStart(8)}` +
        `  con la nuova regola ${nuovo.toFixed(2).padStart(8)}` +
        `  (costo Grenke ${Number(c.pricing_grenke).toFixed(2)})`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
