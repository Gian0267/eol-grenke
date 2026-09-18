/**
 * Rifirma i token di accesso cliente che il server di produzione rifiuterebbe.
 *
 * Capita quando un token viene rigenerato da una macchina con JWT_SECRET
 * diverso: il database e' condiviso, quindi il valore sbagliato finisce sulla
 * pratica e da quel momento il link non apre piu' nulla.
 *
 * I link gia' spediti NON sono toccati: un JWT vale per se stesso, non perche'
 * e' uguale alla copia sul database. Questo script sistema la copia.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/ripara-token-cliente.ts
 *   npx tsx --env-file=backend/.env backend/scripts/ripara-token-cliente.ts --esegui
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const SEGRETO = process.env.JWT_SECRET || '';
const OFFSET = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 21);

async function main() {
  if (!SEGRETO) { console.error('JWT_SECRET non impostato'); process.exit(1); }

  const pratiche = await prisma.contratto_EOL.findMany({
    where: { token_accesso_cliente: { not: null } },
    select: { id: true, cliente_id: true, ambiente: true, stato: true, data_scadenza: true,
              token_accesso_cliente: true, cliente: { select: { ragione_sociale: true } } },
  });

  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');
  let rifirmati = 0, scaduti = 0;

  for (const p of pratiche) {
    try { jwt.verify(p.token_accesso_cliente!, SEGRETO); continue; } catch { /* da rifirmare */ }

    if (!p.data_scadenza) { console.log(`  ?  ${p.cliente.ragione_sociale}: senza scadenza, saltata`); continue; }
    const exp = Math.floor((new Date(p.data_scadenza).getTime() - OFFSET * 86400000) / 1000);
    if (exp * 1000 <= Date.now()) {
      scaduti++;
      console.log(`  --  ${p.ambiente} ${p.cliente.ragione_sociale.slice(0, 32).padEnd(33)} finestra chiusa, nessun token da rifare`);
      continue;
    }

    console.log(`  ok  ${p.ambiente} ${p.cliente.ragione_sociale.slice(0, 32).padEnd(33)} rifirmato (scade ${new Date(exp * 1000).toISOString().slice(0, 10)})`);
    rifirmati++;
    if (ESEGUI) {
      const token = jwt.sign({ contratto_eol_id: p.id, cliente_id: p.cliente_id, exp }, SEGRETO);
      await prisma.contratto_EOL.update({ where: { id: p.id }, data: { token_accesso_cliente: token } });
    }
  }

  console.log(`\nRifirmati ${rifirmati}, fuori finestra ${scaduti}, gia' validi ${pratiche.length - rifirmati - scaduti}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
