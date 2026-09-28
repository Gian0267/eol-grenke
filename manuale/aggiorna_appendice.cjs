/**
 * Riscrive l'appendice del manuale a partire dalle immagini effettivamente
 * generate: quali mail ci sono e quante pagine occupa ciascuna lo dice il
 * manifesto, non un elenco scritto a mano che invecchia in silenzio.
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, 'procedura_backoffice.html');
const MANIFESTO = path.join(__dirname, 'screenshots', 'manifesto.json');

const VOCI = [
  ['A.1', 'comunicazione_iniziale', 'Comunicazione iniziale — email', 'Parte a mano dal backoffice, intorno a T-105. Vedi il punto 6.'],
  ['A.2', 'comunicazione_iniziale_pec', 'Comunicazione iniziale — PEC', 'Stesso contenuto, forma istituzionale. Parte insieme alla email dove abbiamo l&rsquo;indirizzo PEC. Vedi il punto 6.'],
  ['A.3', 'sollecito_1', 'Primo sollecito — T-90', 'Automatico. Vedi il punto 7.'],
  ['A.4', 'sollecito_2', 'Secondo sollecito — T-60', 'Automatico. Vedi il punto 7.'],
  ['A.5', 'sollecito_3', 'Terzo sollecito — T-45', 'Automatico. Vedi il punto 7.'],
  ['A.6', 'sollecito_4', 'Quarto e ultimo sollecito — T-35', 'Automatico. &Egrave; l&rsquo;unico con la fascia rossa. Vedi il punto 7.'],
  ['A.7', 'conferma_sconto_riscatto', 'Conferma dello sconto per nuovo noleggio', 'Parte quando il backoffice certifica la firma del nuovo contratto. Vedi il punto 9.'],
  ['A.8', 'invito_pagamento', 'Invito al pagamento — T-26', 'Automatico, con le coordinate per il bonifico. Vedi il punto 11.'],
  ['A.9', 'conferma_riacquisto', 'Ricevuta di pagamento', 'Parte quando il backoffice registra l&rsquo;accredito. Vedi il punto 11.'],
  ['A.10', 'conferma_restituzione', 'Istruzioni per la restituzione', 'Parte quando il cliente sceglie di restituire. Vedi il punto 12.'],
];

const manifesto = JSON.parse(fs.readFileSync(MANIFESTO, 'utf-8'));
const figura = (didascalia, contesto, file, titolo) =>
  `<figure class="facsimile">\n  <figcaption>${didascalia}</figcaption>\n  <p class="contesto">${contesto}</p>\n  <img src="screenshots/${file}" alt="${titolo}">\n</figure>`;

const blocchi = [];
for (const [sigla, nome, titolo, contesto] of VOCI) {
  const pezzi = manifesto[nome] ?? 1;
  if (pezzi === 1) {
    blocchi.push(figura(`${sigla} — ${titolo}`, contesto, `email_${nome}.png`, titolo));
  } else {
    blocchi.push(figura(`${sigla} — ${titolo} (continua)`, contesto, `email_${nome}_1.png`, titolo));
    blocchi.push(figura(`${sigla} — ${titolo} (seguito)`, 'Seconda met&agrave; della stessa email.', `email_${nome}_2.png`, titolo));
  }
}

let html = fs.readFileSync(HTML, 'utf-8');
const inizio = html.indexOf('<figure class="facsimile">');
const fine = html.lastIndexOf('</figure>') + '</figure>'.length;
if (inizio === -1 || fine <= inizio) throw new Error('Non trovo i facsimili da sostituire nel manuale');
html = html.slice(0, inizio) + blocchi.join('\n\n') + html.slice(fine);
fs.writeFileSync(HTML, html);
console.log(`Appendice aggiornata: ${blocchi.length} pagine di facsimile`);
