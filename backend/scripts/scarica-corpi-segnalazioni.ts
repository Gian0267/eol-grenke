/**
 * Scarica e conserva il corpo delle segnalazioni raccolte quando salvavamo
 * solo i primi 300 caratteri.
 *
 * Il corpo si recupererebbe comunque alla prima apertura, ma quella strada
 * dipende da una connessione IMAP al momento del clic: se e' lenta o fallisce,
 * l'operatore vede il ripiego con la sola anteprima. Riempirle in anticipo
 * toglie di mezzo la dipendenza.
 *
 * Sola lettura sulla casella, come tutto il monitor.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/scarica-corpi-segnalazioni.ts
 */
import { scaricaCorpo } from '../src/services/mail-monitor.service.js';
import { prisma } from '../src/lib/db.js';

async function main() {
  const mancanti = await prisma.monitoredEmail.findMany({
    where: { corpo_testo: null },
    orderBy: { received_at: 'desc' },
    select: { id: true, subject: true, imap_uid: true, casella: true, snippet: true, received_at: true },
  });
  console.log(`Segnalazioni senza corpo: ${mancanti.length}\n`);

  let ok = 0, ko = 0;
  for (const m of mancanti) {
    const corpo = await scaricaCorpo(m.casella, m.imap_uid);
    const eti = `${m.received_at.toISOString().slice(0, 10)} ${(m.subject || '').slice(0, 45).padEnd(45)}`;
    if (!corpo) {
      ko++;
      console.log(`  --  ${eti} non recuperabile (uid ${m.imap_uid} su ${m.casella ?? 'casella singola'})`);
      continue;
    }
    await prisma.monitoredEmail.update({
      where: { id: m.id },
      data: { corpo_testo: corpo.slice(0, 100_000) },
    });
    ok++;
    console.log(`  ok  ${eti} ${corpo.length} car. (snippet ne aveva ${m.snippet.length})`);
  }

  console.log(`\nConservati ${ok}, non recuperabili ${ko}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
