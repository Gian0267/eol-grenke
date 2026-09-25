/**
 * Allinea le righe Impostazione dei template email al contenuto dei file.
 *
 * Il testo che parte e' la riga a database, non il file: senza questo passaggio
 * una modifica ai template non cambia niente per i clienti. Sovrascrivere alla
 * cieca pero' cancellerebbe le personalizzazioni fatte dal pannello, che nessuno
 * ha tracciato da nessuna parte.
 *
 * Il confronto e' con la versione del file all'ultimo commit: se la riga a
 * database e' identica a quella, nessuno l'ha toccata dal pannello e si puo'
 * riscrivere con la versione nuova. Se e' diversa, lo script si ferma su quella
 * riga e lo dice: va sistemata a mano o con una sostituzione mirata.
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

/** Versione del file all'ultimo commit, o null se il file e' nuovo. */
function versioneCommittata(path: string): string | null {
  try {
    return execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf-8' });
  } catch {
    return null;
  }
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
    const committata = versioneCommittata(path);
    const combacia = committata !== null && (r.valore ?? '') === committata;
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
    console.log(`\nNON toccate, il valore a database non corrisponde all'ultimo commit:\n  ${personalizzate.join('\n  ')}`);
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
