/**
 * Script one-off — Aggiornamento testi "Premio Fedeltà: Sconto Copertura Bronze".
 *
 * Riallinea le impostazioni nel DB (template email, label pricing, testi area
 * cliente, script telefonici) ai nuovi testi nei file sorgente, sostituendo la
 * terminologia "gift card". Usa la logica smart-upsert di seedImpostazioni:
 * - label, descrizione e valore_default vengono SEMPRE aggiornati
 * - il valore corrente viene sovrascritto SOLO se non personalizzato dall'admin
 *   (le chiavi personalizzate vengono elencate nel log per allineamento manuale)
 *
 * Idempotente e rieseguibile. Esecuzione:
 *   npx tsx backend/scripts/aggiorna-testi-sconto-bronze.ts
 * (in locale punta al DB indicato da backend/.env; per la produzione eseguire
 *  sul server o con DATABASE_URL/DIRECT_URL del DB Supabase di produzione)
 */
import { PrismaClient } from '@prisma/client';
import { seedImpostazioni } from '../prisma/seed-impostazioni.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Aggiornamento testi Premio Fedeltà: Sconto Copertura Bronze ===\n');
  await seedImpostazioni(prisma);
  console.log('\nFatto. Le chiavi segnalate come personalizzate vanno allineate a mano dall\'editor Impostazioni.');
}

main()
  .catch((err) => {
    console.error('Errore:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
