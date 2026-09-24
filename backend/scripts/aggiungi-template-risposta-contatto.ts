/**
 * Crea la riga DB del template "Risposta a richiesta di contatto".
 *
 * Il template vivo e' la riga nel database: senza questa, la risposta usa il
 * file su disco e non si puo' ritoccare dal pannello.
 *
 *   npx tsx --env-file=backend/.env backend/scripts/aggiungi-template-risposta-contatto.ts --esegui
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/lib/db.js';

const ESEGUI = process.argv.includes('--esegui');
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const html = readFileSync(resolve(__dirname, '../../templates/email/risposta_contatto.html'), 'utf-8');
  const riga = {
    chiave: 'email.risposta_contatto',
    valore: html,
    tipo: 'HTML',
    categoria: 'EMAIL',
    label: 'Risposta a richiesta di contatto',
    descrizione: 'Usato quando il backoffice risponde per iscritto a un cliente da "Clienti in attesa". Il testo lo scrive l\'operatore e finisce in {{{messaggio}}}',
  };

  const esistente = await prisma.impostazione.findUnique({ where: { chiave: riga.chiave } });
  if (esistente) {
    console.log(`= ${riga.chiave}: gia' presente (${esistente.valore.length} caratteri), lasciata invariata`);
  } else {
    console.log(`${ESEGUI ? '+' : '(prova)'} ${riga.chiave} (${html.length} caratteri)`);
    if (ESEGUI) await prisma.impostazione.create({ data: { ...riga, valore_default: html } });
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
