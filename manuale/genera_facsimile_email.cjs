/**
 * Fotografa le email come le riceve il cliente, per l'appendice del manuale.
 *
 * I template li prende dal database quando ci sono: quello e' il testo che
 * parte davvero, il file e' solo la copia di partenza. I dati sono finti ma
 * plausibili, e i blocchi condizionali sono impostati come in produzione
 * (premio fedelta' spento, sconto nuovo noleggio acceso, pagamento a bonifico).
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const { PrismaClient } = require('@prisma/client');

const DIR = path.join(__dirname, 'screenshots');
const SOGLIA_TAGLIO = 1000;
const SOVRAPPOSIZIONE = 30;
const TEMPLATES = [
  ['comunicazione_iniziale', 'email.comunicazione_iniziale'],
  ['comunicazione_iniziale_pec', 'email.comunicazione_iniziale_pec'],
  ['sollecito_1', 'email.sollecito_1'],
  ['sollecito_2', 'email.sollecito_2'],
  ['sollecito_3', 'email.sollecito_3'],
  ['sollecito_4', 'email.sollecito_4'],
  ['conferma_sconto_riscatto', 'email.conferma_sconto_riscatto'],
  ['invito_pagamento', 'email.invito_pagamento'],
  ['conferma_riacquisto', null],
  ['conferma_restituzione', 'email.conferma_restituzione'],
];

const DATI = {
  ragione_sociale: 'Acme SRL',
  numero_contratto_nsm: 'NSM-2026-00418',
  numero_contratto_grenke: 'G-FLEX-26-00418',
  data_scadenza: '31/12/2026',
  beni: 'Notebook Lenovo ThinkPad X1 Carbon, Monitor LG 27"',
  beni_riacquisto: 'Notebook Lenovo ThinkPad X1 Carbon',
  monte_canoni: '3.060,00',
  pricing_riacquisto: '244,80',
  pricing_netto: '244,80',
  pricing_iva: '53,86',
  pricing_totale: '298,66',
  importo_netto: '208,08',
  importo_iva: '45,78',
  importo_totale: '253,86',
  metodo_pagamento: 'Bonifico bancario',
  fattura_numero: '2026/0418',
  data_termine_bonifico: '10/12/2026',
  pagamento_intestatario: 'Integra Systems Srl',
  pagamento_banca: 'Banca Sella',
  pagamento_iban: 'IT00 X000 0000 0000 0000 0000 000',
  link_pagamento: '#',
  link_area_cliente: '#',
  link_opt_out: '#',
  deadline_decisione: '01/12/2026',
  nome_agente: 'Mario Rossi',
  referente_nome: 'Giuseppe Bianchi',
  telefono: '011 1234567',
  email_cliente: 'amministrazione@acme.it',
  // Blocchi condizionali, come sono configurati oggi in produzione.
  opzione_rinnovo_attiva: false,
  riacquisto_parziale: false,
  pagamento_online_attivo: false,
  num_opzione_riacquisto: 1,
  num_opzione_contatto: 2,
  num_opzione_restituzione: 3,
  num_opzione_nuovo_noleggio: 4,
  sconto_attivo: true,
  sconto_percentuale: 15,
  sconto_data_limite: '30/11/2026',
  giorni_al_limite: 28,
  prezzo_riacquisto_scontato: '208,08',
  sconto_euro: '36,72',
  prezzo_pieno: '244,80',
  prezzo_scontato: '208,08',
  risparmio: '36,72',
  link_nuovo_noleggio: '#',
};

(async () => {
  const prisma = new PrismaClient();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 680, height: 1000, deviceScaleFactor: 2 });

  for (const [nome, chiave] of TEMPLATES) {
    let sorgente = null;
    if (chiave) {
      const riga = await prisma.impostazione.findUnique({ where: { chiave } });
      sorgente = riga?.valore ?? null;
    }
    let daDatabase = !!sorgente;
    if (!sorgente) sorgente = fs.readFileSync(path.join(__dirname, '..', 'templates', 'email', `${nome}.html`), 'utf-8');

    const html = Handlebars.compile(sorgente)(DATI);
    // Non 'networkidle0': se un template punta a un'immagine remota che non
    // risponde, la generazione resta appesa mezzo minuto e poi fallisce.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise((r) => setTimeout(r, 400));
    const h = await page.evaluate(() => document.body.scrollHeight);

    // Su una pagina A4 l'immagine sta in altezza: piu' la mail e' lunga, piu'
    // esce stretta e illeggibile. Sopra una certa altezza la taglio in due, con
    // un filo di sovrapposizione per non spezzare una riga a meta'.
    if (h > SOGLIA_TAGLIO) {
      const meta = Math.ceil(h / 2);
      const pezzi = [
        { file: `email_${nome}_1.png`, y: 0, height: meta + SOVRAPPOSIZIONE },
        { file: `email_${nome}_2.png`, y: meta - SOVRAPPOSIZIONE, height: h - meta + SOVRAPPOSIZIONE },
      ];
      for (const pezzo of pezzi) {
        await page.screenshot({
          path: path.join(DIR, pezzo.file),
          clip: { x: 0, y: pezzo.y, width: 680, height: Math.min(pezzo.height, h - pezzo.y) },
        });
      }
      console.log(`  ${nome.padEnd(28)} ${daDatabase ? 'database' : 'file    '}  ${h}px — divisa in 2`);
    } else {
      await page.screenshot({ path: path.join(DIR, `email_${nome}.png`), fullPage: true });
      console.log(`  ${nome.padEnd(28)} ${daDatabase ? 'database' : 'file    '}  ${h}px`);
    }
  }

  await browser.close();
  await prisma.$disconnect();
})();
