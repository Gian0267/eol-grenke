/**
 * Carica l'anagrafica delle agenzie da un foglio Excel a due colonne:
 * nome dell'agenzia e link di registrazione a un nuovo noleggio.
 *
 * Non sovrascrive mai un link gia' presente a database: il foglio e' una
 * fotografia di partenza, la fonte buona diventa il pannello.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/importa-agenzie.ts <file.xlsx>
 *   npx tsx --env-file=backend/.env backend/scripts/importa-agenzie.ts <file.xlsx> --esegui
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const FILE = process.argv.find(a => a.endsWith('.xlsx') || a.endsWith('.xls'));

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

async function main() {
  if (!FILE) {
    console.error('Indicare il file: ... importa-agenzie.ts <file.xlsx>');
    process.exit(1);
  }

  const wb = XLSX.read(readFileSync(FILE), { type: 'buffer' });
  const foglio = wb.Sheets[wb.SheetNames[0]!]!;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(foglio, { header: 1, defval: null });

  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');

  let creati = 0, aggiornati = 0, invariati = 0;
  for (let i = 1; i < rows.length; i++) {
    const nome = str(rows[i]![0]);
    const link = str(rows[i]![1]) || null;
    if (!nome) continue;

    const esistente = await prisma.agenzia.findUnique({ where: { nome } });

    if (!esistente) {
      console.log(`  + ${nome.padEnd(24)} ${link ? 'con link' : 'SENZA link'}`);
      creati++;
      if (ESEGUI) await prisma.agenzia.create({ data: { nome, link_onboarding: link } });
      continue;
    }
    // Un link gia' a database vince sul foglio: potrebbe essere stato corretto
    // dal pannello dopo l'ultima esportazione.
    if (esistente.link_onboarding || !link) { invariati++; continue; }

    console.log(`  ~ ${nome.padEnd(24)} link aggiunto`);
    aggiornati++;
    if (ESEGUI) await prisma.agenzia.update({ where: { id: esistente.id }, data: { link_onboarding: link } });
  }

  console.log(`\nNuove ${creati}, link aggiunti ${aggiornati}, invariate ${invariati}`);

  if (ESEGUI) {
    const senza = await prisma.agenzia.count({ where: { link_onboarding: null } });
    const tot = await prisma.agenzia.count();
    console.log(`A database: ${tot} agenzie, di cui ${senza} ancora senza link`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
