/**
 * Porta i testi liberi della ricevuta di pagamento nelle Impostazioni.
 *
 * Prima erano scritti dentro invoice.service.ts e per cambiare una parola
 * serviva un rilascio. I valori qui sotto sono IDENTICI a quelli che il PDF
 * produceva finora: lo spostamento non cambia una virgola di cio' che il
 * cliente legge.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/testi-ricevuta-in-impostazioni.ts
 *   npx tsx --env-file=backend/.env backend/scripts/testi-ricevuta-in-impostazioni.ts --esegui
 */
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');

const RIGHE = [
  { chiave: 'ricevuta.titolo', valore: 'RICEVUTA DI CONFERMA PAGAMENTO', tipo: 'TESTO', categoria: 'EMAIL', label: 'Ricevuta: titolo', descrizione: 'Titolo in testa al PDF della ricevuta di pagamento' },
  { chiave: 'ricevuta.voce_importo', valore: 'Riacquisto beni (acconto)', tipo: 'TESTO', categoria: 'EMAIL', label: 'Ricevuta: voce di spesa', descrizione: 'Descrizione della riga di importo nel dettaglio della ricevuta' },
  { chiave: 'ricevuta.avvertenza_fiscale', valore: 'AVVERTENZA: Questo documento non costituisce fattura fiscale ai sensi del DPR 633/72. La fattura elettronica sara emessa tramite Sistema di Interscambio (SDI) dall\'ERP aziendale.', tipo: 'TESTO', categoria: 'EMAIL', label: 'Ricevuta: avvertenza fiscale', descrizione: 'Testo in rosso sotto il totale. Chiarisce che la ricevuta non e\' una fattura' },
  { chiave: 'ricevuta.nota_finale', valore: 'La presente ricevuta attesta l\'avvenuto pagamento dell\'acconto per il riacquisto dei beni sopra indicati. Il trasferimento di proprieta avverra alla data T+11 dalla scadenza del contratto Grenke.', tipo: 'TESTO', categoria: 'EMAIL', label: 'Ricevuta: nota finale', descrizione: 'Nota di chiusura della ricevuta' },
  { chiave: 'ricevuta.nota_parziale', valore: 'Acquisto parziale concordato: la presente ricevuta riguarda i soli beni sopra indicati. I restanti beni del contratto ({{beni_da_restituire}}) devono essere restituiti secondo la procedura di reso.', tipo: 'TESTO', categoria: 'EMAIL', label: 'Ricevuta: nota riacquisto parziale', descrizione: 'Aggiunta prima della nota finale solo sui riacquisti parziali. {{beni_da_restituire}} viene sostituito con l\'elenco dei beni esclusi' },
];

async function main() {
  console.log(ESEGUI ? '=== ESECUZIONE ===' : '=== PROVA A VUOTO (aggiungi --esegui) ===');
  for (const r of RIGHE) {
    const esistente = await prisma.impostazione.findUnique({ where: { chiave: r.chiave } });
    if (esistente) {
      console.log(`  = ${r.chiave}: gia' presente, lasciata invariata`);
      continue;
    }
    console.log(`  + ${r.chiave}`);
    console.log(`      ${r.valore.slice(0, 100)}${r.valore.length > 100 ? '...' : ''}`);
    if (ESEGUI) await prisma.impostazione.create({ data: { ...r, valore_default: r.valore } });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
