/**
 * Porta nel database la terminologia decisa dal titolare: verso il cliente non
 * si dice piu' "riscatto" ne' "riacquisto", si dice sempre "acquisto".
 *
 * Nei file (template e pagine) la sostituzione e' gia' fatta. Qui vanno toccate
 * le righe Impostazione, che sono il testo vivo: la mail che parte e' la riga a
 * database, non il file. Non sovrascrivo con il file perche' perderei le
 * personalizzazioni fatte dal pannello: applico la stessa sostituzione al
 * valore salvato, qualunque esso sia.
 *
 * Due cose restano intenzionalmente fuori:
 *  - tutto cio' che sta dentro {{...}}: sono nomi di variabile
 *    ({{pricing_riacquisto}}), rinominarli svuoterebbe le mail;
 *  - monitor.keywords, dove "Riscatto" serve a intercettare le risposte dei
 *    clienti, che la parola continueranno a usarla.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/terminologia-acquisto.ts
 *   npx tsx --env-file=backend/.env backend/scripts/terminologia-acquisto.ts --esegui
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const esegui = process.argv.includes('--esegui');

/** Chiavi da non toccare: il valore non e' prosa rivolta al cliente. */
const ESCLUSE = [/^monitor\./];

/** Applica una sostituzione solo fuori dalle espressioni Handlebars. */
function fuoriDaiSegnaposto(testo: string, f: (s: string) => string): string {
  return testo
    .split(/(\{\{[^}]*\}\})/)
    .map((pezzo, i) => (i % 2 === 1 ? pezzo : f(pezzo)))
    .join('');
}

/** Mantiene maiuscola iniziale e tutto-maiuscolo dell'originale. */
function comeOriginale(originale: string, nuovo: string): string {
  if (originale === originale.toUpperCase()) return nuovo.toUpperCase();
  if (originale[0] === originale[0].toUpperCase()) return nuovo[0].toUpperCase() + nuovo.slice(1);
  return nuovo;
}

export function terminologia(testo: string): string {
  return fuoriDaiSegnaposto(testo, (s) => {
    // "il riscatto", "sul riacquisto"...: sparendo la "ri" l'articolo va elidito
    s = s.replace(
      /\b([Ii]l|[Dd]el|[Aa]l|[Dd]al|[Nn]el|[Ss]ul) ri(?:scatt|acquist)(o|i)\b/g,
      (_m, art: string, coda: string) => {
        const elisi: Record<string, string> = {
          il: "l'", del: "dell'", al: "all'", dal: "dall'", nel: "nell'", sul: "sull'",
        };
        return comeOriginale(art, elisi[art.toLowerCase()]) + 'acquist' + coda;
      },
    );
    // riscatt* -> acquist* (riscatto, riscattare, riscattati, riscattabile...)
    s = s.replace(/([Rr]|RI)[Ii]?[Ss][Cc][Aa][Tt][Tt](\w*)/g, (m, _p, coda) =>
      comeOriginale(m, 'acquist' + coda),
    );
    s = s.replace(/[Rr]iacquist(\w*)/g, (m, coda) => comeOriginale(m, 'acquist' + coda));
    return s;
  });
}

async function main() {
  const righe = await prisma.impostazione.findMany({ orderBy: { chiave: 'asc' } });
  let toccate = 0;

  for (const r of righe) {
    if (ESCLUSE.some((re) => re.test(r.chiave))) continue;
    const valore = r.valore ?? '';
    const nuovo = terminologia(valore);
    if (nuovo === valore) continue;

    toccate++;
    const cambi: string[] = [];
    const a = valore.split(/(\{\{[^}]*\}\})/);
    const b = nuovo.split(/(\{\{[^}]*\}\})/);
    a.forEach((pezzo, i) => {
      if (pezzo === b[i]) return;
      for (const m of pezzo.matchAll(/[Rr]i(scatt|acquist)\w*/g)) {
        const ctx = pezzo.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 25).replace(/\s+/g, ' ');
        cambi.push(`      …${ctx.trim()}…`);
      }
    });
    console.log(`\n  ${r.chiave} [${r.categoria}] — ${cambi.length} occorrenze`);
    console.log(cambi.slice(0, 6).join('\n'));
    if (cambi.length > 6) console.log(`      (+${cambi.length - 6} altre)`);

    if (esegui) {
      await prisma.impostazione.update({ where: { chiave: r.chiave }, data: { valore: nuovo } });
    }
  }

  console.log(
    `\n${toccate} impostazioni ${esegui ? 'aggiornate' : 'da aggiornare'}` +
      (esegui ? '.' : ' — rilancia con --esegui per scrivere.'),
  );
  await prisma.$disconnect();
}

// Eseguito solo da riga di comando: cosi' terminologia() resta collaudabile.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
