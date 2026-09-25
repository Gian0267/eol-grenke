/**
 * Allinea le righe Impostazione dei template email al contenuto dei file.
 *
 * Il testo che parte e' la riga a database, non il file: senza questo passaggio
 * una modifica ai template non cambia niente per i clienti. Sovrascrivere alla
 * cieca pero' cancellerebbe le personalizzazioni fatte dal pannello, che nessuno
 * ha tracciato da nessuna parte.
 *
 * Il confronto e' con TUTTE le versioni committate del file: se la riga a
 * database combacia con una qualsiasi di esse, e' una copia rimasta indietro e
 * si puo' riscrivere. Se non combacia con nessuna, l'ha riscritta una persona
 * dal pannello: lo script si ferma su quella riga e lo dice.
 *
 * Il confronto col solo HEAD non bastava: dopo aver committato le modifiche ai
 * template, ogni riga rimasta indietro sembrava personalizzata, e lo script si
 * rifiutava di fare proprio il lavoro per cui esiste.
 *
 * Quando la differenza e' voluta e si e' guardata, la riga si forza per nome:
 * --forza=email.sollecito_1,email.sollecito_2
 *
 *   npx tsx --env-file=backend/.env backend/scripts/allinea-template-email.ts
 *   npx tsx --env-file=backend/.env backend/scripts/allinea-template-email.ts --esegui
 */
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');
const forzate = new Set(
  (process.argv.find((a) => a.startsWith('--forza='))?.slice(8) ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean),
);

/** Le chiavi seguono il nome del file, tranne questa. */
const ECCEZIONI: Record<string, string> = {
  'email.conferma_contatto': 'notifica_richiesta_contatto.html',
};

function fileDellaChiave(chiave: string): string {
  return `templates/email/${ECCEZIONI[chiave] ?? chiave.replace(/^email\./, '') + '.html'}`;
}

/** Tutte le versioni committate del file, dalla piu' recente. */
function versioniCommittate(path: string): string[] {
  let sha: string[];
  try {
    sha = execFileSync('git', ['log', '--format=%H', '--', path], { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
  const versioni: string[] = [];
  for (const s of sha) {
    try {
      versioni.push(execFileSync('git', ['show', `${s}:${path}`], { encoding: 'utf-8' }));
    } catch {
      // Il file non esisteva ancora a quel commit: niente da confrontare.
    }
  }
  return versioni;
}

async function main() {
  const righe = await prisma.impostazione.findMany({
    where: { chiave: { startsWith: 'email.' }, tipo: 'HTML' },
    orderBy: { chiave: 'asc' },
  });

  let allineate = 0;
  let gia = 0;
  const personalizzate: string[] = [];
  const senzaFile: string[] = [];

  for (const r of righe) {
    const path = fileDellaChiave(r.chiave);
    if (!existsSync(path)) {
      senzaFile.push(`${r.chiave} (atteso ${path})`);
      continue;
    }
    const attuale = readFileSync(path, 'utf-8');
    if ((r.valore ?? '') === attuale) {
      gia++;
      continue;
    }
    const combacia = versioniCommittate(path).includes(r.valore ?? '');
    if (!combacia && !forzate.has(r.chiave)) {
      personalizzate.push(r.chiave);
      continue;
    }
    allineate++;
    console.log(`  ${r.chiave} ← ${path}${combacia ? '' : ' (forzata)'}`);
    if (esegui) {
      await prisma.impostazione.update({ where: { chiave: r.chiave }, data: { valore: attuale } });
    }
  }

  console.log(`\n${allineate} da allineare, ${gia} gia' allineate.`);
  if (personalizzate.length) {
    console.log(`\nNON toccate, il valore a database non corrisponde a nessuna versione committata\n(riscritte dal pannello — vanno aggiornate a mano o forzate):\n  ${personalizzate.join('\n  ')}`);
  }
  if (senzaFile.length) {
    console.log(`\nSenza file corrispondente (nessuna azione):\n  ${senzaFile.join('\n  ')}`);
  }
  if (!esegui && allineate) console.log('\nProva a vuoto — rilancia con --esegui per scrivere.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
