/**
 * Script di rollout — Pagamento riacquisto solo con bonifico bancario.
 *
 * Cosa fa sul DB (Impostazione):
 *  1. Sovrascrive il template email.invito_pagamento con la versione che
 *     include le coordinate bancarie ({{#unless pagamento_online_attivo}}).
 *  2. Crea le impostazioni con i dati bancari (modificabili da Impostazioni →
 *     Recapiti): intestatario, IBAN, banca.
 *  3. Crea (o aggiorna a false) il flag `flags.abilita_pagamento_online`:
 *     la mascherina di pagamento mostra l'IBAN per il bonifico manuale invece
 *     di Fabrick/Stripe. Riattivabile da Impostazioni → Feature Flags.
 *
 * Va eseguito DOPO il deploy del codice (i template usano variabili che il
 * codice vecchio non fornisce).
 *
 * Esecuzione (dalla cartella del progetto):
 *   npx tsx --env-file=backend/.env backend/scripts/attiva-pagamento-bonifico.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, '../../templates');

async function main() {
  console.log('=== Pagamento riacquisto: solo bonifico bancario ===\n');

  // 1. Template invito pagamento con coordinate bancarie
  const valore = readFileSync(resolve(templatesDir, 'email/invito_pagamento.html'), 'utf-8');
  await prisma.impostazione.upsert({
    where: { chiave: 'email.invito_pagamento' },
    update: { valore, valore_default: valore },
    create: {
      chiave: 'email.invito_pagamento',
      valore,
      valore_default: valore,
      tipo: 'HTML',
      categoria: 'EMAIL',
      label: 'Invito pagamento (T-23)',
      descrizione: 'Template email di invito al pagamento del riacquisto, con coordinate bancarie quando il pagamento online e disattivato',
    },
  });
  console.log('✅ email.invito_pagamento aggiornato (coordinate bancarie condizionali)');

  // 2. Dati bancari
  const datiBancari = [
    { chiave: 'pagamenti.intestatario', valore: 'Smartcom Solutions S.r.l.', label: 'Intestatario conto incassi', descrizione: 'Intestatario del conto corrente mostrato al cliente per il bonifico di riacquisto' },
    { chiave: 'pagamenti.iban', valore: 'IT96S0853001002000000267119', label: 'IBAN incassi', descrizione: 'IBAN mostrato al cliente nella mascherina di pagamento e nella mail di invito al pagamento' },
    { chiave: 'pagamenti.banca', valore: 'Banca d\'Alba', label: 'Banca incassi', descrizione: 'Nome della banca del conto incassi' },
  ];
  for (const d of datiBancari) {
    await prisma.impostazione.upsert({
      where: { chiave: d.chiave },
      update: { valore: d.valore, valore_default: d.valore },
      create: { ...d, valore_default: d.valore, tipo: 'TESTO', categoria: 'RECAPITI' },
    });
    console.log(`✅ ${d.chiave} = ${d.valore}`);
  }

  // 3. Flag pagamento online → OFF
  await prisma.impostazione.upsert({
    where: { chiave: 'flags.abilita_pagamento_online' },
    update: { valore: 'false' },
    create: {
      chiave: 'flags.abilita_pagamento_online',
      valore: 'false',
      valore_default: 'false',
      tipo: 'BOOLEANO',
      categoria: 'FEATURE_FLAGS',
      label: 'Pagamento online attivo',
      descrizione: 'Se attivo, il cliente paga il riacquisto online (Fabrick/Stripe). Se disattivo, la mascherina mostra i dati bancari (IBAN) per il bonifico manuale e il backoffice registra l\'incasso',
    },
  });
  console.log('✅ flags.abilita_pagamento_online = false (riattivabile da Impostazioni → Feature Flags)');

  console.log('\nFatto. Da ora il riacquisto si paga solo con bonifico verso l\'IBAN configurato.');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
