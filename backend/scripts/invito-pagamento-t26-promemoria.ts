/**
 * Script di rollout — Invito pagamento a T-26 + promemoria a T-23.
 *
 * Cosa fa sul DB (Impostazione):
 *  1. timeline.pagamento_riacquisto → 26: primo invito al pagamento e apertura
 *     della finestra di pagamento 26 giorni prima della scadenza.
 *  2. Crea timeline.invito_pagamento_promemoria = 23: promemoria con lo stesso
 *     testo del primo invito + avviso "ignora se hai già pagato"; lo scheduler
 *     lo salta se il bonifico è già stato dichiarato o il pagamento completato.
 *  3. Sovrascrive email.invito_pagamento con la versione che include il box
 *     promemoria condizionale ({{#if promemoria}}).
 *  4. Aggiorna il testo della card riacquisto ("23 giorni" → "26 giorni"),
 *     sostituendo solo la sottostringa per preservare personalizzazioni.
 *
 * Va eseguito DOPO il deploy del codice.
 *
 * Esecuzione (dalla cartella del progetto):
 *   npx tsx --env-file=backend/.env backend/scripts/invito-pagamento-t26-promemoria.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

async function main() {
  console.log('=== Invito pagamento T-26 + promemoria T-23 ===\n');

  // 1. Primo invito + finestra pagamento a T-26
  await prisma.impostazione.upsert({
    where: { chiave: 'timeline.pagamento_riacquisto' },
    update: { valore: '26', valore_default: '26' },
    create: {
      chiave: 'timeline.pagamento_riacquisto',
      valore: '26',
      valore_default: '26',
      tipo: 'NUMERO',
      categoria: 'TIMELINE',
      label: 'Richiesta pagamento riacquisto',
      descrizione: 'Giorni prima della scadenza per il primo invito al pagamento del riacquisto e l\'apertura della finestra di pagamento',
    },
  });
  console.log('✅ timeline.pagamento_riacquisto = 26');

  // 2. Promemoria a T-23
  await prisma.impostazione.upsert({
    where: { chiave: 'timeline.invito_pagamento_promemoria' },
    update: { valore: '23', valore_default: '23' },
    create: {
      chiave: 'timeline.invito_pagamento_promemoria',
      valore: '23',
      valore_default: '23',
      tipo: 'NUMERO',
      categoria: 'TIMELINE',
      label: 'Promemoria pagamento riacquisto',
      descrizione: 'Giorni prima della scadenza per il promemoria di pagamento (stesso testo del primo invito + avviso di ignorare se gia pagato); non parte se il bonifico e gia stato dichiarato',
    },
  });
  console.log('✅ timeline.invito_pagamento_promemoria = 23');

  // 3. Template con box promemoria condizionale
  const valore = readFileSync(resolve(templatesDir, 'email/invito_pagamento.html'), 'utf-8');
  await prisma.impostazione.update({
    where: { chiave: 'email.invito_pagamento' },
    data: { valore, valore_default: valore },
  });
  console.log('✅ email.invito_pagamento aggiornato (box promemoria condizionale)');

  // 4. Testo card riacquisto: "23 giorni" → "26 giorni"
  const desc = await prisma.impostazione.findUnique({ where: { chiave: 'cliente.desc_opzione_riacquisto' } });
  if (desc && desc.valore.includes('23 giorni')) {
    await prisma.impostazione.update({
      where: { chiave: 'cliente.desc_opzione_riacquisto' },
      data: {
        valore: desc.valore.replace('23 giorni', '26 giorni'),
        valore_default: desc.valore_default.replace('23 giorni', '26 giorni'),
      },
    });
    console.log('✅ cliente.desc_opzione_riacquisto: "23 giorni" → "26 giorni"');
  } else {
    console.log('ℹ️ cliente.desc_opzione_riacquisto: nessun "23 giorni" da sostituire');
  }

  console.log('\nFatto. Timeline pagamento riacquisto: invito+finestra a T-26, promemoria a T-23, verifica accrediti dal T-21.');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
