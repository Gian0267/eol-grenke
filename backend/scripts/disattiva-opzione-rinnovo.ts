/**
 * Script di rollout — Fase 1 workflow senza opzione Rinnovo + pagamento a T-23.
 *
 * Cosa fa sul DB (Impostazione):
 *  1. Sovrascrive valore + valore_default dei 6 template email modificati
 *     (comunicazione iniziale, PEC, solleciti 1-4) con le versioni condizionali
 *     ({{#if opzione_rinnovo_attiva}}): senza questo, i template nel DB
 *     continuerebbero a mostrare l'opzione Rinnovo con numerazione fissa.
 *  2. Crea (o aggiorna a false) il flag `flags.abilita_opzione_rinnovo`:
 *     l'opzione Rinnovo sparisce da email/PEC/solleciti/area cliente e il
 *     flusso di rinnovo viene bloccato. Riattivabile da Impostazioni →
 *     Feature Flags senza altri interventi.
 *  3. Crea (o aggiorna a 23) `timeline.pagamento_riacquisto`: la richiesta di
 *     pagamento riacquisto parte a T-23 così a T-21 il pagamento è verificabile.
 *  4. Aggiorna il testo della card riacquisto ("21 giorni" → "23 giorni"),
 *     sostituendo solo la sottostringa per preservare eventuali personalizzazioni.
 *
 * ATTENZIONE: il punto 1 sovrascrive eventuali personalizzazioni fatte a mano
 * dall'admin sui 6 template email.
 *
 * Esecuzione (dalla cartella del progetto):
 *   npx tsx backend/scripts/disattiva-opzione-rinnovo.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

const TEMPLATE_DA_FORZARE = [
  'comunicazione_iniziale',
  'comunicazione_iniziale_pec',
  'sollecito_1',
  'sollecito_2',
  'sollecito_3',
  'sollecito_4',
];

async function main() {
  console.log('=== Fase 1: disattivazione opzione Rinnovo + pagamento T-23 ===\n');

  // 1. Template email condizionali
  for (const nome of TEMPLATE_DA_FORZARE) {
    const valore = readFileSync(resolve(templatesDir, `email/${nome}.html`), 'utf-8');
    await prisma.impostazione.update({
      where: { chiave: `email.${nome}` },
      data: { valore, valore_default: valore },
    });
    console.log(`✅ email.${nome} aggiornato alla versione condizionale`);
  }

  // 2. Flag opzione Rinnovo → OFF
  await prisma.impostazione.upsert({
    where: { chiave: 'flags.abilita_opzione_rinnovo' },
    update: { valore: 'false' },
    create: {
      chiave: 'flags.abilita_opzione_rinnovo',
      valore: 'false',
      valore_default: 'false',
      tipo: 'BOOLEANO',
      categoria: 'FEATURE_FLAGS',
      label: 'Opzione Rinnovo attiva',
      descrizione: 'Se attivo, l\'opzione Rinnovo compare in email/PEC/solleciti e nell\'area cliente. Se disattivo, le altre opzioni vengono rinumerate 1-2-3 e il flusso di rinnovo e bloccato',
    },
  });
  console.log('✅ flags.abilita_opzione_rinnovo = false (riattivabile da Impostazioni → Feature Flags)');

  // 3. Pagamento riacquisto a T-23
  await prisma.impostazione.upsert({
    where: { chiave: 'timeline.pagamento_riacquisto' },
    update: { valore: '23', valore_default: '23' },
    create: {
      chiave: 'timeline.pagamento_riacquisto',
      valore: '23',
      valore_default: '23',
      tipo: 'NUMERO',
      categoria: 'TIMELINE',
      label: 'Richiesta pagamento riacquisto',
      descrizione: 'Giorni prima della scadenza per l\'invio della richiesta di pagamento del riacquisto (anticipata rispetto alla verifica a T-21)',
    },
  });
  console.log('✅ timeline.pagamento_riacquisto = 23');

  // 4. Testo card riacquisto: solo la sottostringa "21 giorni" → "23 giorni"
  const descRiacquisto = await prisma.impostazione.findUnique({ where: { chiave: 'cliente.desc_opzione_riacquisto' } });
  if (descRiacquisto && descRiacquisto.valore.includes('21 giorni')) {
    await prisma.impostazione.update({
      where: { chiave: 'cliente.desc_opzione_riacquisto' },
      data: {
        valore: descRiacquisto.valore.replace('21 giorni', '23 giorni'),
        valore_default: descRiacquisto.valore_default.replace('21 giorni', '23 giorni'),
      },
    });
    console.log('✅ cliente.desc_opzione_riacquisto: "21 giorni" → "23 giorni"');
  } else {
    console.log('ℹ️ cliente.desc_opzione_riacquisto: nessun "21 giorni" da sostituire');
  }

  console.log('\nFatto. Il flag è riattivabile in ogni momento da Impostazioni → Feature Flags.');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
