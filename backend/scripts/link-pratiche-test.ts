/**
 * Elenco dei link all'area cliente delle pratiche di test, con accanto quello
 * che serve sapere prima di provarle: data limite dello sconto e se la quarta
 * opzione comparira' o no.
 *
 * I token cambiano a ogni "Reset dati test": rilancia lo script dopo il reset.
 * Con --html scrive anche una pagina apribile dal browser, in
 * backoffice-link-test.html (ignorata da git), dove i link sono cliccabili.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/link-pratiche-test.ts
 *   npx tsx --env-file=backend/.env backend/scripts/link-pratiche-test.ts --html
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';
import { dataLimiteSconto, prezzoRiacquisto } from '../src/services/pricing.service.js';
import { linkNuovoNoleggioPerPratica } from '../src/services/onboarding-link.service.js';

const prisma = new PrismaClient();
// NON si legge FRONTEND_URL: in locale vale localhost:5173 e i link uscirebbero
// morti per chiunque non stia girando Vite. Il default e' la produzione, il
// resto si passa a mano con --base=...
const base = process.argv.find((a) => a.startsWith('--base='))?.slice(7) || 'https://eol.noleggiosumisura.it';
const oggi = new Date();

const righe = await prisma.contratto_EOL.findMany({
  where: { ambiente: 'TEST' },
  include: { cliente: true },
  orderBy: { contratto_grenke_id: 'asc' },
});

const dati = [];
for (const c of righe) {
  const limite = c.data_scadenza ? dataLimiteSconto(c.data_scadenza) : null;
  const { link } = await linkNuovoNoleggioPerPratica(c as any);
  const pr = await prezzoRiacquisto(c as any);
  const inTempo = limite ? limite >= oggi : false;
  dati.push({
    id: c.contratto_grenke_id,
    cliente: c.cliente?.ragione_sociale ?? '—',
    stato: c.stato,
    scadenza: c.data_scadenza,
    limite,
    sconto: inTempo && !!link && !pr.prezzo_concordato,
    listino: pr.listino,
    scontato: Number((pr.listino * 0.85).toFixed(2)),
    url: `${base}/pratica/${c.token_accesso_cliente}`,
  });
}

const gg = (d: Date | null) => (d ? d.toLocaleDateString('it-IT') : '—');

for (const d of dati) {
  console.log(
    `\n${d.id}  ${d.cliente}  [${d.stato}]\n` +
      `  scadenza ${gg(d.scadenza)} · limite sconto ${gg(d.limite)} · ` +
      (d.sconto ? `4a opzione SI — € ${d.listino} → € ${d.scontato}` : '4a opzione NO') +
      `\n  ${d.url}`,
  );
}

if (process.argv.includes('--html')) {
  const html = `<!doctype html><meta charset="utf-8"><title>Pratiche di test</title>
<style>body{font:15px system-ui;margin:2rem;max-width:60rem}h1{font-size:1.3rem}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5e7eb;padding:.5rem;text-align:left}
.si{color:#047857;font-weight:600}.no{color:#9ca3af}small{color:#6b7280}</style>
<h1>Pratiche di test — area cliente</h1>
<p><small>Generato il ${oggi.toLocaleString('it-IT')}. I token cambiano dopo il reset dei dati di test.</small></p>
<table><tr><th>Contratto</th><th>Cliente</th><th>Limite sconto</th><th>4ª opzione</th><th></th></tr>
${dati
  .map(
    (d) => `<tr><td>${d.id}</td><td>${d.cliente}<br><small>${d.stato}</small></td><td>${gg(d.limite)}</td>
<td class="${d.sconto ? 'si' : 'no'}">${d.sconto ? `€ ${d.listino} → € ${d.scontato}` : 'no'}</td>
<td><a href="${d.url}" target="_blank">apri</a></td></tr>`,
  )
  .join('\n')}
</table>`;
  writeFileSync('backoffice-link-test.html', html);
  console.log('\nScritto backoffice-link-test.html');
}

await prisma.$disconnect();
