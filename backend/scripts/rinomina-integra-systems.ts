/**
 * Da "Integra Solutions" a "Integra Systems" nelle impostazioni.
 *
 * Tocca SOLO le impostazioni: nome dell'azienda, intestatario del conto e
 * template delle comunicazioni. P.IVA (12711040019) e sede restano quelle:
 * cambia il nome, non la societa'.
 *
 * NON riscrive le comunicazioni gia' inviate. Quelle sono la copia di cio' che
 * il cliente ha davvero ricevuto: correggerle a posteriori vorrebbe dire
 * falsificare un archivio.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/rinomina-integra-systems.ts
 *   npx tsx --env-file=backend/.env backend/scripts/rinomina-integra-systems.ts --esegui
 */
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const DA = 'Integra Solutions';
const A = 'Integra Systems';

async function main() {
  const tutte = await prisma.impostazione.findMany();
  const colpite = tutte.filter(i => i.valore.includes(DA) || i.valore_default.includes(DA));

  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');
  console.log(`Impostazioni da aggiornare: ${colpite.length} su ${tutte.length}\n`);

  for (const i of colpite) {
    const n = (i.valore.match(new RegExp(DA, 'g')) || []).length;
    console.log(`  ${i.chiave.padEnd(34)} ${i.tipo.padEnd(6)} ${n} occorrenze`);
    // I valori brevi si mostrano per intero: sono quelli che finiscono sotto
    // gli occhi del cliente come nome dell'azienda o del conto.
    if (i.valore.length < 80) console.log(`      "${i.valore}"  ->  "${i.valore.replaceAll(DA, A)}"`);
    if (ESEGUI) {
      await prisma.impostazione.update({
        where: { chiave: i.chiave },
        data: {
          valore: i.valore.replaceAll(DA, A),
          valore_default: i.valore_default.replaceAll(DA, A),
        },
      });
    }
  }

  const storiche = await prisma.comunicazione.count({ where: { corpo_html: { contains: DA } } });
  console.log(`\n${storiche} comunicazioni gia' inviate contengono il vecchio nome: NON vengono toccate.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
