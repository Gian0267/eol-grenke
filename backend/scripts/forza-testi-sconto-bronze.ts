/**
 * Script one-off — FORZA i nuovi testi "Premio Fedeltà: Sconto Copertura Bronze"
 * sulle 8 impostazioni il cui valore nel DB contiene ancora la vecchia
 * terminologia "gift card" (drift storico dei rename precedenti, quando i
 * template furono aggiornati a mano nel DB senza allineare valore_default).
 *
 * A differenza di aggiorna-testi-sconto-bronze.ts (che preserva i valori
 * "personalizzati"), questo script SOVRASCRIVE valore e valore_default delle
 * sole chiavi elencate sotto. Le altre chiavi flaggate come personalizzate
 * (cliente.titolo_opzione_rinnovo, cliente.desc_opzione_riacquisto) NON
 * vengono toccate perché non contengono terminologia gift card.
 *
 * Esecuzione (dalla cartella del progetto):
 *   npx tsx backend/scripts/forza-testi-sconto-bronze.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

const DA_FORZARE: Array<{ chiave: string; valore: string }> = [
  { chiave: 'email.comunicazione_iniziale', valore: readFileSync(resolve(templatesDir, 'email/comunicazione_iniziale.html'), 'utf-8') },
  { chiave: 'email.comunicazione_iniziale_pec', valore: readFileSync(resolve(templatesDir, 'email/comunicazione_iniziale_pec.html'), 'utf-8') },
  { chiave: 'email.sollecito_1', valore: readFileSync(resolve(templatesDir, 'email/sollecito_1.html'), 'utf-8') },
  { chiave: 'email.sollecito_2', valore: readFileSync(resolve(templatesDir, 'email/sollecito_2.html'), 'utf-8') },
  { chiave: 'email.sollecito_3', valore: readFileSync(resolve(templatesDir, 'email/sollecito_3.html'), 'utf-8') },
  { chiave: 'email.sollecito_4', valore: readFileSync(resolve(templatesDir, 'email/sollecito_4.html'), 'utf-8') },
  { chiave: 'email.conferma_rinnovo', valore: readFileSync(resolve(templatesDir, 'email/conferma_rinnovo.html'), 'utf-8') },
  { chiave: 'cliente.desc_opzione_rinnovo', valore: 'Prosegui con un nuovo contratto FLEX scegliendo dispositivi, quantita e durata in base alle tue esigenze: grazie al Premio Fedelta ricevi uno sconto sulla copertura danni accidentali BRONZE.' },
];

async function main() {
  console.log('=== Forzatura testi Sconto Copertura Bronze (8 chiavi) ===\n');
  for (const { chiave, valore } of DA_FORZARE) {
    await prisma.impostazione.update({ where: { chiave }, data: { valore, valore_default: valore } });
    console.log(`✅ ${chiave} forzato ai nuovi testi`);
  }
  const tutte = await prisma.impostazione.findMany();
  const residui = tutte.filter(i => /gift\s*card/i.test(i.valore)).map(i => i.chiave);
  console.log(residui.length === 0
    ? '\n✅ Nessun residuo "gift card" nei valori delle impostazioni'
    : `\n⚠️ Residui in: ${residui.join(', ')}`);
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
