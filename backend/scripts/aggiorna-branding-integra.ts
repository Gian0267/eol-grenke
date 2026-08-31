/**
 * Rebranding Smartcom Solutions Srl -> Integra Solutions Srl sul DB (tabella Impostazione).
 *
 * I template email e i recapiti "vivi" sono le righe Impostazione: modificare i file in
 * templates/email/ NON cambia ciò che il cliente riceve. Questo script allinea il DB.
 *
 * Uso:
 *   npx tsx --env-file=backend/.env backend/scripts/aggiorna-branding-integra.ts [--dry] [--dominio]
 *
 *   --dry       mostra cosa cambierebbe senza scrivere
 *   --dominio   applica ANCHE eol.smartcomgroup.it -> eol.noleggiosumisura.it
 *               (URL del logo nei template): eseguirlo SOLO dopo che il nuovo dominio
 *               risponde, altrimenti le immagini nelle email si rompono.
 *
 * Idempotente: rieseguirlo non produce ulteriori modifiche.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const DOMINIO = process.argv.includes('--dominio');

const REGOLE: Array<[RegExp, string]> = [
  [/Smartcom Solutions S\.r\.l\./g, 'Integra Solutions S.r.l.'],
  [/Smartcom Solutions Srl/g, 'Integra Solutions Srl'],
  [/Smartcom Solutions/g, 'Integra Solutions'],
  [/\bSmartcom\b/g, 'Integra Solutions'],
  [/info@smartcomsolutions\.it/g, 'info@noleggiosumisura.it'],
  [/smartcomsolutions@pec\.it/g, 'integra@pec.integrasystems.it'],
  [/noreply@smartcomgroup\.it/g, 'info@noleggiosumisura.it'],
  [/noreply@noleggiosumisura\.it/g, 'info@noleggiosumisura.it'],
];

const REGOLE_DOMINIO: Array<[RegExp, string]> = [
  [/eol\.smartcomgroup\.it/g, 'eol.noleggiosumisura.it'],
];

function applica(testo: string | null): string | null {
  if (!testo) return testo;
  let out = testo;
  for (const [re, sost] of REGOLE) out = out.replace(re, sost);
  if (DOMINIO) for (const [re, sost] of REGOLE_DOMINIO) out = out.replace(re, sost);
  return out;
}

async function main() {
  console.log(`Rebranding Integra Solutions — modalità: ${DRY ? 'DRY RUN' : 'SCRITTURA'}${DOMINIO ? ' + dominio' : ''}\n`);

  const righe = await prisma.impostazione.findMany({ orderBy: { chiave: 'asc' } });
  let modificate = 0;

  for (const r of righe) {
    const valore = applica(r.valore);
    const label = applica(r.label);
    const descrizione = applica(r.descrizione);

    const cambia =
      valore !== r.valore || label !== r.label || descrizione !== r.descrizione;
    if (!cambia) continue;

    modificate++;
    console.log(`• ${r.chiave}`);
    if (valore !== r.valore) {
      if ((r.valore || '').length <= 120) {
        console.log(`    valore: "${r.valore}" -> "${valore}"`);
      } else {
        const prima = (r.valore || '').split(/\r?\n/);
        const dopo = (valore || '').split(/\r?\n/);
        const diff = prima.filter((l, i) => l !== dopo[i]).length;
        console.log(`    valore: HTML ${(r.valore || '').length} char, ${diff} righe modificate`);
      }
    }
    if (label !== r.label) console.log(`    label: "${r.label}" -> "${label}"`);
    if (descrizione !== r.descrizione) console.log(`    descrizione aggiornata`);

    if (!DRY) {
      await prisma.impostazione.update({
        where: { chiave: r.chiave },
        data: { valore: valore ?? r.valore, label, descrizione },
      });
    }
  }

  console.log(`\n${modificate} impostazioni ${DRY ? 'da aggiornare' : 'aggiornate'} su ${righe.length}.`);
  if (!DOMINIO) {
    console.log('Nota: il dominio nei link/logo NON è stato toccato. Rilancia con --dominio dopo il cutover DNS.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
