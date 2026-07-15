import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Driver adapter PostgreSQL puro (niente motore Rust separato): le query
// passano dal driver `pg` in-process. `max` contenuto perché su LiteSpeed
// girano più istanze dell'app e il pooler Supabase ha un tetto condiviso.
// Timeout obbligatori: senza, una connessione rotta (visto il 10/07/2026 dopo
// la saturazione processi Hostinger) lascia le query appese all'infinito e
// l'istanza sembra viva (health ok) ma non risponde più su nulla che tocchi il
// DB. idleTimeout chiude le connessioni inattive così le istanze stantie non
// occupano slot del pooler Supabase.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 60_000,
  keepAlive: true,
});

export const prisma = new PrismaClient({ adapter });
