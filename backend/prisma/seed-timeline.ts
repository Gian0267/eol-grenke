import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const FINESTRE = [
  { label: 'T-90', giorni_a_scadenza: 90, count: 2 },
  { label: 'T-60', giorni_a_scadenza: 60, count: 2 },
  { label: 'T-50', giorni_a_scadenza: 50, count: 2 },
  { label: 'T-45', giorni_a_scadenza: 45, count: 2 },
  { label: 'T-40', giorni_a_scadenza: 40, count: 2 },
  { label: 'T-35', giorni_a_scadenza: 35, count: 2 },
  { label: 'T-30', giorni_a_scadenza: 30, count: 2 },
];

async function main() {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  console.log(`\n📅 Seed Timeline — data di riferimento: ${oggi.toLocaleDateString('it-IT')}\n`);

  const contratti = await prisma.contratto_EOL.findMany({
    where: { stato: { in: ['LISTA_RICEVUTA', 'COMUNICAZIONE_INVIATA', 'IN_ATTESA_DECISIONE', 'FLEX_ATTIVO'] } },
    include: { cliente: { select: { ragione_sociale: true, opt_out_comunicazioni: true } } },
    orderBy: { contratto_nsm_id: 'asc' },
  });

  if (contratti.length < 14) {
    console.error(`❌ Servono almeno 14 contratti, trovati ${contratti.length}.`);
    console.log('   Esegui prima npm run db:seed per popolare il database.');
    process.exit(1);
  }

  let idx = 0;
  for (const finestra of FINESTRE) {
    for (let i = 0; i < finestra.count; i++) {
      const contratto = contratti[idx]!;
      const nuovaScadenza = addDays(oggi, finestra.giorni_a_scadenza);

      const statoTarget = finestra.giorni_a_scadenza >= 50
        ? 'COMUNICAZIONE_INVIATA'
        : 'IN_ATTESA_DECISIONE';

      await prisma.contratto_EOL.update({
        where: { id: contratto.id },
        data: {
          data_scadenza: nuovaScadenza,
          stato: statoTarget,
        },
      });

      console.log(
        `  ✅ ${finestra.label} | ${contratto.contratto_nsm_id} | ${contratto.cliente.ragione_sociale.padEnd(25)} | ` +
        `scadenza: ${nuovaScadenza.toLocaleDateString('it-IT')} | stato: ${statoTarget}` +
        `${contratto.cliente.opt_out_comunicazioni ? ' [OPT-OUT]' : ''}`
      );

      idx++;
    }
  }

  // Assicura almeno 1 contratto con monte_canoni >= 5000 nella finestra T-35
  const contrattiT35 = await prisma.contratto_EOL.findMany({
    where: {
      data_scadenza: {
        gte: addDays(oggi, 34),
        lte: addDays(oggi, 36),
      },
    },
  });

  if (contrattiT35.length > 0) {
    const primo = contrattiT35[0]!;
    if (Number(primo.monte_canoni) < 5000) {
      await prisma.contratto_EOL.update({
        where: { id: primo.id },
        data: { monte_canoni: 7200, canone_mensile: 200, numero_mesi: 36 },
      });
      console.log(`\n  💰 Forzato monte_canoni >= 5000 su ${primo.contratto_nsm_id} per test CAPO_AREA su T-35`);
    }
  }

  console.log(`\n🎯 ${idx} contratti aggiornati con scadenze nelle finestre di test.\n`);
  console.log('Ora puoi testare lo scheduler con:');
  console.log('  curl -X POST http://localhost:3001/api/admin/scheduler/run-now \\');
  console.log('    -H "Content-Type: application/json" \\');
  console.log('    -H "x-user-id: <ADMIN_USER_ID>" \\');
  console.log('    -d \'{}\'');
  console.log('\nOppure con data simulata:');
  console.log('  -d \'{"simulate_date": "2026-09-01"}\'');
}

main()
  .catch(e => {
    console.error('❌ Seed timeline error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
