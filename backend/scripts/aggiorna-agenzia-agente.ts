/**
 * Riempie agenzia e agente sulle pratiche gia' in archivio, leggendoli
 * dall'export NSM (colonna A e colonna B).
 *
 * Serve perche' reimportare lo stesso file NON aggiorna nulla: l'import
 * combinato salta le pratiche gia' presenti (stato GIA_PRESENTE). Questo
 * script lavora per numero di contratto Grenke e tocca solo quei due campi:
 * niente prezzi, niente stati, nessuna comunicazione.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiorna-agenzia-agente.ts <file.xlsx>
 *   npx tsx --env-file=backend/.env backend/scripts/aggiorna-agenzia-agente.ts <file.xlsx> --esegui
 */
import { readFileSync } from 'fs';
import { parseNsmExport } from '../src/services/nsm-import.service.js';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const FILE = process.argv.find(a => a.endsWith('.xlsx') || a.endsWith('.xls'));

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

async function main() {
  if (!FILE) {
    console.error('Indicare il file di export NSM: ... aggiorna-agenzia-agente.ts <file.xlsx>');
    process.exit(1);
  }

  const { gruppi } = parseNsmExport(readFileSync(FILE));
  console.log(`File letto: ${gruppi.size} contratti Grenke nel file NSM`);

  // La rete commerciale e' per contratto: si prende dalla prima riga del gruppo.
  const daFile = new Map<string, { agenzia: string | null; agente: string | null }>();
  for (const [grenkeId, righe] of gruppi.entries()) {
    const prima = righe[0];
    if (!prima || grenkeId.startsWith('__RIGA_')) continue;
    daFile.set(grenkeId, {
      agenzia: str(prima.agenzia) || null,
      agente: str(prima.agente) || null,
    });
  }

  const pratiche = await prisma.contratto_EOL.findMany({
    select: { id: true, contratto_grenke_id: true, agenzia: true, agente: true,
              cliente: { select: { ragione_sociale: true } } },
    orderBy: { contratto_grenke_id: 'asc' },
  });

  let daAggiornare = 0, invariate = 0, nonNelFile = 0, senzaDato = 0;
  const modifiche: Array<{ id: string; agenzia: string | null; agente: string | null }> = [];

  for (const p of pratiche) {
    const v = daFile.get(p.contratto_grenke_id);
    if (!v) {
      nonNelFile++;
      console.log(`  ?  ${p.contratto_grenke_id.padEnd(12)} non presente nel file — lasciata com'e'`);
      continue;
    }
    if (!v.agenzia && !v.agente) {
      senzaDato++;
      console.log(`  !  ${p.contratto_grenke_id.padEnd(12)} colonne A e B vuote nel file — ${p.cliente.ragione_sociale}`);
      continue;
    }
    if (v.agenzia === p.agenzia && v.agente === p.agente) { invariate++; continue; }

    daAggiornare++;
    modifiche.push({ id: p.id, ...v });
    console.log(`  +  ${p.contratto_grenke_id.padEnd(12)} agenzia "${v.agenzia ?? ''}" | agente "${v.agente ?? ''}"` +
                (p.agenzia || p.agente ? `  (era "${p.agenzia ?? ''}" | "${p.agente ?? ''}")` : ''));
  }

  console.log(`\nDa aggiornare ${daAggiornare}, gia' corrette ${invariate}, senza dato nel file ${senzaDato}, non nel file ${nonNelFile}`);

  if (!ESEGUI) {
    console.log('\n(prova a vuoto — aggiungi --esegui per scrivere)');
    await prisma.$disconnect();
    return;
  }

  for (const m of modifiche) {
    await prisma.contratto_EOL.update({
      where: { id: m.id },
      data: { agenzia: m.agenzia, agente: m.agente },
    });
  }
  console.log(`\n${modifiche.length} pratiche aggiornate.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
