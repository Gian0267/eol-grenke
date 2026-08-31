/**
 * Configura le caselle monitorate dal monitor IMAP (impostazione `monitor.caselle`).
 *
 * Il valore vive a DB e non su hPanel: contiene password, e il pannello ha gia'
 * consegnato valori corrotti in passato (cfr. pec.password). La riga e' marcata
 * NASCOSTA per non esporla nella UI Impostazioni.
 *
 * Uso:
 *   npx tsx --env-file=backend/.env backend/scripts/imposta-caselle-monitor.ts <file.json> [--forza]
 *
 * Il file JSON e' un array di caselle:
 *   [
 *     { "etichetta": "info NSM", "host": "imap.register.it", "port": 993,
 *       "secure": true, "user": "info@noleggiosumisura.it", "password": "..." }
 *   ]
 * `port` (993) e `secure` (true) sono opzionali. Tenerlo FUORI dal repository.
 *
 * Ogni casella viene provata in sola lettura prima della scrittura: senza
 * --forza, se anche una sola fallisce non viene scritto nulla (una casella
 * silenziosamente irraggiungibile equivale a non monitorarla affatto).
 */
import { readFileSync } from 'fs';
import { ImapFlow } from 'imapflow';
import { prisma } from '../src/lib/db.js';

interface CasellaInput {
  etichetta?: string;
  host: string;
  port?: number;
  secure?: boolean;
  user: string;
  password: string;
}

const percorso = process.argv[2];
const forza = process.argv.includes('--forza');

if (!percorso || percorso.startsWith('--')) {
  console.error('Uso: npx tsx --env-file=backend/.env backend/scripts/imposta-caselle-monitor.ts <file.json> [--forza]');
  process.exit(1);
}

let caselle: CasellaInput[];
try {
  const parsed = JSON.parse(readFileSync(percorso, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('il file deve contenere un array');
  caselle = parsed;
} catch (e) {
  console.error(`File non leggibile: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const invalide = caselle.filter(c => !c?.host || !c?.user || !c?.password);
if (invalide.length > 0) {
  console.error(`${invalide.length} caselle senza host, user o password. Nessuna scrittura.`);
  process.exit(1);
}

const normalizzate = caselle.map(c => ({
  etichetta: c.etichetta || c.user,
  host: c.host,
  port: Number(c.port || 993),
  secure: c.secure !== false,
  user: c.user,
  password: c.password,
}));

console.log(`Verifica di ${normalizzate.length} caselle (sola lettura, nessuna mail toccata)\n`);

let falliti = 0;
for (const c of normalizzate) {
  const client = new ImapFlow({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.password },
    logger: false,
  });
  try {
    await client.connect();
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    console.log(`  OK      ${c.user} (${c.host}:${c.port}) — ${box.exists} messaggi in INBOX`);
    await client.logout();
  } catch (err) {
    falliti++;
    console.log(`  FALLITA ${c.user} (${c.host}:${c.port}) — ${err instanceof Error ? err.message : String(err)}`);
    try { await client.logout(); } catch { /* gia' chiusa */ }
  }
}

if (falliti > 0 && !forza) {
  console.error(`\n${falliti} caselle non raggiungibili: nessuna scrittura. Correggi le credenziali, oppure usa --forza per salvare comunque.`);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.impostazione.upsert({
  where: { chiave: 'monitor.caselle' },
  update: { valore: JSON.stringify(normalizzate) },
  create: {
    chiave: 'monitor.caselle',
    valore: JSON.stringify(normalizzate),
    tipo: 'NASCOSTA',
    categoria: 'RECAPITI',
    label: 'Caselle monitorate (IMAP)',
    descrizione: 'Elenco JSON delle caselle lette dal monitor. Se valorizzato ha priorita\' sulle variabili MONITOR_IMAP_*.',
    valore_default: '',
  },
});

console.log(`\nmonitor.caselle scritta a DB: ${normalizzate.map(c => c.user).join(', ')}`);
if (falliti > 0) console.log(`ATTENZIONE: ${falliti} caselle salvate pur non rispondendo (--forza).`);
await prisma.$disconnect();
