/**
 * Porta la soglia della prima comunicazione da T-82 a T-105.
 *
 * T-82 era il valore di partenza, mai cambiato da nessuno, ed era PIU' BASSO
 * del primo sollecito (T-90): una pratica comunicata a ridosso della soglia
 * saltava il sollecito 1 senza che nessuno se ne accorgesse, perche' i
 * solleciti scattano al giorno esatto.
 *
 * T-105 non e' inventato: e' quando le comunicazioni sono partite davvero per
 * 40 pratiche su 45.
 *
 * La soglia NON fa partire nulla da sola — la prima comunicazione si manda a
 * mano — quindi questo cambio non sposta nessun invio: rende solo coerente
 * l'ordine della timeline e giusto il riquadro in dashboard.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/allinea-soglia-comunicazione-iniziale.ts --esegui
 */
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const NUOVO = '105';

async function main() {
  const r = await prisma.impostazione.findUnique({ where: { chiave: 'timeline.comunicazione_iniziale' } });
  if (!r) { console.error('Impostazione assente'); process.exit(1); }

  const primo = await prisma.impostazione.findUnique({ where: { chiave: 'timeline.sollecito_email_1' } });
  console.log(`Prima comunicazione: T-${r.valore} -> T-${NUOVO}`);
  console.log(`Primo sollecito:     T-${primo?.valore} (resta invariato)`);

  if (Number(NUOVO) <= Number(primo?.valore ?? 0)) {
    console.error('La soglia resterebbe sotto quella del primo sollecito: non procedo.');
    process.exit(1);
  }

  if (!ESEGUI) { console.log('\n(prova a vuoto — aggiungi --esegui)'); await prisma.$disconnect(); return; }

  await prisma.impostazione.update({
    where: { chiave: 'timeline.comunicazione_iniziale' },
    data: { valore: NUOVO, valore_default: NUOVO },
  });
  console.log('Aggiornata.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
