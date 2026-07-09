/**
 * Script di rollout — testi pagamento nelle comunicazioni iniziali (email + PEC):
 * sovrascrive i due template nel DB con la versione condizionale sul flag
 * pagamento online ("bonifico bancario" quando il pagamento online è OFF).
 * Eseguire DOPO il deploy.
 *
 * Esecuzione: npx tsx --env-file=backend/.env backend/scripts/aggiorna-testi-pagamento-comunicazione.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

async function main() {
  for (const nome of ['comunicazione_iniziale', 'comunicazione_iniziale_pec']) {
    const valore = readFileSync(resolve(templatesDir, `email/${nome}.html`), 'utf-8');
    await prisma.impostazione.update({ where: { chiave: `email.${nome}` }, data: { valore, valore_default: valore } });
    console.log(`✅ email.${nome} aggiornato (bonifico bancario quando pagamento online OFF)`);
  }
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
