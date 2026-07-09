import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Driver adapter PostgreSQL puro (niente motore Rust separato): le query
// passano dal driver `pg` in-process. `max` contenuto perché su LiteSpeed
// girano più istanze dell'app e il pooler Supabase ha un tetto condiviso.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export const prisma = new PrismaClient({ adapter });
