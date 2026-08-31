/**
 * Script di rollout — Impostazione "Telefono Grenke (fine noleggio)".
 *
 * Numero mostrato nella pagina "Termini di gestione scaduti" al cliente
 * silente che risponde tardivamente. Il codice ha comunque il fallback
 * 02-30082525: questa riga serve a renderlo modificabile da Impostazioni →
 * Recapiti.
 *
 * Esecuzione: npx tsx --env-file=backend/.env backend/scripts/imposta-telefono-grenke.ts
 */
import { prisma } from '../src/lib/db.js';

async function main() {
  await prisma.impostazione.upsert({
    where: { chiave: 'recapiti.telefono_grenke' },
    update: {},
    create: {
      chiave: 'recapiti.telefono_grenke',
      valore: '02-30082525',
      valore_default: '02-30082525',
      tipo: 'TESTO',
      categoria: 'RECAPITI',
      label: 'Telefono Grenke (fine noleggio)',
      descrizione: 'Numero Grenke indicato al cliente quando i termini di gestione Integra Solutions sono scaduti',
    },
  });
  console.log('✅ recapiti.telefono_grenke = 02-30082525');
}

main()
  .catch((err) => { console.error('Errore:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
