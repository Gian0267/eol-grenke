/**
 * Script di rollout — testi delle comunicazioni cliente:
 *  - pagamento "tramite bonifico bancario" quando il pagamento online è OFF
 *  - SOLO il numero di contratto Grenke (via i riferimenti NSM)
 * Sovrascrive i template cliente nel DB con le versioni dai file.
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
  for (const nome of ['comunicazione_iniziale', 'comunicazione_iniziale_pec', 'sollecito_1', 'sollecito_2', 'sollecito_3', 'sollecito_4', 'invito_pagamento', 'conferma_restituzione', 'conferma_rinnovo']) {
    const valore = readFileSync(resolve(templatesDir, `email/${nome}.html`), 'utf-8');
    await prisma.impostazione.update({ where: { chiave: `email.${nome}` }, data: { valore, valore_default: valore } });
    console.log(`✅ email.${nome} aggiornato (bonifico + solo numero Grenke)`);
  }
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
