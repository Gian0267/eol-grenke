/**
 * Uniforma la dicitura del metodo di pagamento nell'opzione riacquisto della
 * comunicazione iniziale (email + PEC): "Pagamento tramite bonifico
 * istantaneo." — sparisce ogni riferimento a pagamento online / carta.
 * Sostituisce l'intero blocco {{#if pagamento_online_attivo}} dei template a
 * DB (sostituzione mirata: le altre personalizzazioni restano intatte).
 *
 * Uso: npx tsx --env-file=backend/.env backend/scripts/aggiorna-testo-bonifico-istantaneo.ts
 * ATTENZIONE: il DB è quello di produzione (condiviso dev/live).
 */
import { prisma } from '../src/lib/db.js';

const SOSTITUZIONI: Array<{ chiave: string; da: string; a: string }> = [
  {
    chiave: 'email.comunicazione_iniziale',
    da: '{{#if pagamento_online_attivo}}Pagamento online sicuro tramite bonifico istantaneo o carta.{{else}}Pagamento tramite bonifico bancario: ricever&agrave; le coordinate al momento del pagamento.{{/if}}',
    a: 'Pagamento tramite bonifico istantaneo.',
  },
  {
    chiave: 'email.comunicazione_iniziale_pec',
    da: '{{#if pagamento_online_attivo}}con pagamento online tramite bonifico istantaneo o carta.{{else}}con pagamento tramite bonifico bancario (le coordinate verranno fornite al momento del pagamento).{{/if}}',
    a: 'con pagamento tramite bonifico istantaneo.',
  },
];

for (const s of SOSTITUZIONI) {
  const imp = await prisma.impostazione.findUnique({ where: { chiave: s.chiave } });
  if (!imp) {
    console.log(`${s.chiave}: riga non trovata — SALTATA`);
    continue;
  }
  if (!imp.valore.includes(s.da)) {
    const giaFatto = imp.valore.includes(s.a);
    console.log(`${s.chiave}: blocco atteso non trovato — ${giaFatto ? 'già aggiornata' : 'VERIFICARE A MANO'}`);
    continue;
  }
  await prisma.impostazione.update({
    where: { chiave: s.chiave },
    data: { valore: imp.valore.replace(s.da, s.a) },
  });
  console.log(`${s.chiave}: aggiornata ✓`);
}
await prisma.$disconnect();
