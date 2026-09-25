/**
 * Sposta il riquadro della quarta opzione (acquisto scontato con nuovo
 * noleggio) sotto l'opzione 3, dove il cliente si aspetta di trovarlo.
 *
 * Stava dopo il pulsante "Scegli la tua opzione" e dopo il riquadro della
 * deadline: numerata "OPZIONE 4" ma fuori dall'elenco delle opzioni, con due
 * blocchi in mezzo. Ora e' l'ultima della fila, prima del pulsante.
 *
 * Il testo vivo e' la riga a database: lo script sposta il blocco dentro il
 * valore salvato invece di sovrascrivere col file, cosi' le personalizzazioni
 * fatte dal pannello restano.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/sposta-opzione-4.ts
 *   npx tsx --env-file=backend/.env backend/scripts/sposta-opzione-4.ts --esegui
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const FILE = 'templates/email/comunicazione_iniziale.html';
const esegui = process.argv.includes('--esegui');

const INIZIO = '{{#if sconto_attivo}}';
const FINE = '{{/if}}';
const COMMENTO = '<!-- Quarta opzione';
const ANCORA = '<!-- CTA Button -->';

/** Sposta il blocco della quarta opzione appena prima del pulsante. */
export function spostaBlocco(html: string): string | null {
  const iIf = html.indexOf(INIZIO);
  const iAncora = html.indexOf(ANCORA);
  if (iIf === -1 || iAncora === -1) return null;
  if (iIf < iAncora) return null; // gia' al posto giusto

  const iFine = html.indexOf(FINE, iIf);
  if (iFine === -1) return null;

  // Il commento che spiega il blocco lo precede: si porta dietro anche quello.
  const iCommento = html.lastIndexOf(COMMENTO, iIf);
  const inizioTaglio = iCommento === -1 ? iIf : html.lastIndexOf('\n', iCommento) + 1;
  const fineTaglio = iFine + FINE.length;

  const blocco = html.slice(inizioTaglio, fineTaglio).trimEnd();
  const senzaBlocco = html.slice(0, inizioTaglio) + html.slice(fineTaglio).replace(/^\n+/, '\n');

  const iAncora2 = senzaBlocco.indexOf(ANCORA);
  const inizioRiga = senzaBlocco.lastIndexOf('\n', iAncora2) + 1;
  const indent = senzaBlocco.slice(inizioRiga, iAncora2);

  return (
    senzaBlocco.slice(0, inizioRiga) + blocco + '\n\n' + indent + senzaBlocco.slice(iAncora2)
  );
}

async function main() {
  // Il file non e' quello che parte, ma se resta indietro la prossima persona
  // che lo legge crede che l'ordine sia un altro.
  const sorgente = readFileSync(FILE, 'utf-8');
  const sorgenteNuova = spostaBlocco(sorgente);
  if (sorgenteNuova) {
    console.log(`${FILE}: blocco da spostare${esegui ? ' — spostato' : ''}`);
    if (esegui) writeFileSync(FILE, sorgenteNuova);
  } else {
    console.log(`${FILE}: gia' a posto`);
  }

  const riga = await prisma.impostazione.findUnique({ where: { chiave: 'email.comunicazione_iniziale' } });
  if (!riga?.valore) {
    console.log('Riga email.comunicazione_iniziale non trovata.');
    return;
  }
  const nuovo = spostaBlocco(riga.valore);
  if (!nuovo) {
    console.log('Niente da spostare: il blocco è già al posto giusto, oppure gli ancoraggi non ci sono più.');
    return;
  }

  const posIf = nuovo.indexOf(INIZIO);
  const posCta = nuovo.indexOf(ANCORA);
  console.log(`Blocco spostato: ora inizia a ${posIf}, il pulsante a ${posCta} — ${posIf < posCta ? 'ordine corretto' : 'ANCORA SBAGLIATO'}`);

  if (esegui) {
    await prisma.impostazione.update({ where: { chiave: 'email.comunicazione_iniziale' }, data: { valore: nuovo } });
    console.log('Impostazione aggiornata.');
  } else {
    console.log('Prova a vuoto — rilancia con --esegui per scrivere.');
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
