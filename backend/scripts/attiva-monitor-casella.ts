/**
 * Script di rollout — Monitor casella info@ (v1.2.0).
 * Crea le impostazioni del monitor (keyword, destinatari digest, orario, flag).
 * La migrazione MonitoredEmail è già applicata. Eseguire DOPO il deploy.
 *
 * Esecuzione: npx tsx --env-file=backend/.env backend/scripts/attiva-monitor-casella.ts
 */
import { prisma } from '../src/lib/db.js';

const RIGHE = [
  { chiave: 'monitor.keywords', valore: 'Noleggio\nRiscatto\nGrenke\nIfis\nRiacquisto\nRi-acquisto\nfine contratto\nfine noleggio\nfine locazione\nrestituzione\nproroga\nrinnovo\nscadenza', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Monitor casella: keyword', descrizione: 'Parole chiave (una per riga) che rendono rilevante una mail ricevuta su info@noleggiosumisura.it' },
  { chiave: 'monitor.digest_destinatari', valore: 'g.ciardo@gmail.com', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Monitor casella: destinatari digest', descrizione: 'Indirizzi (uno per riga o separati da virgola) che ricevono il digest mattutino delle segnalazioni' },
  { chiave: 'monitor.digest_orario', valore: '08:00', tipo: 'TESTO', categoria: 'RECAPITI', label: 'Monitor casella: orario digest', descrizione: 'Orario (HH:MM, Europa/Roma) di invio del digest giornaliero; nessun invio se non ci sono segnalazioni' },
  { chiave: 'flags.abilita_monitor_casella', valore: 'true', tipo: 'BOOLEANO', categoria: 'FEATURE_FLAGS', label: 'Monitor casella info@ attivo', descrizione: 'Se attivo, la casella info@noleggiosumisura.it viene letta (in sola lettura) ogni 15 minuti e le mail rilevanti finiscono in Segnalazioni + digest mattutino' },
];

async function main() {
  console.log('=== Monitor casella info@ (v1.2.0) ===\n');
  for (const r of RIGHE) {
    await prisma.impostazione.upsert({
      where: { chiave: r.chiave },
      update: {},
      create: { ...r, valore_default: r.valore },
    });
    console.log(`✅ ${r.chiave}`);
  }
  console.log('\nFatto. Ricordarsi le variabili MONITOR_IMAP_* su hPanel (attive dal prossimo riavvio).');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
