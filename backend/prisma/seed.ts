import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function main() {
  console.log('🌱 Starting seed...');

  const passwordHash = await bcrypt.hash('test1234', 10);

  // ─── Utenti NSM ───────────────────────────────────────────────────────────
  const admin = await prisma.utente_NSM.upsert({
    where: { email: 'admin@nsm.it' },
    update: {},
    create: { nome: 'Admin', cognome: 'System', email: 'admin@nsm.it', ruolo: 'ADMIN', password: passwordHash },
  });
  const backoffice = await prisma.utente_NSM.upsert({
    where: { email: 'backoffice@nsm.it' },
    update: {},
    create: { nome: 'Sofia', cognome: 'Ferraris', email: 'backoffice@nsm.it', ruolo: 'BACKOFFICE_INTERNO', password: passwordHash },
  });
  const capoArea = await prisma.utente_NSM.upsert({
    where: { email: 'capoarea@nsm.it' },
    update: {},
    create: { nome: 'Giulia', cognome: 'Bianchi', email: 'capoarea@nsm.it', ruolo: 'CAPO_AREA', password: passwordHash },
  });
  const agente = await prisma.utente_NSM.upsert({
    where: { email: 'agente@nsm.it' },
    update: {},
    create: { nome: 'Mario', cognome: 'Rossi', email: 'agente@nsm.it', ruolo: 'AGENTE', password: passwordHash },
  });
  const junior = await prisma.utente_NSM.upsert({
    where: { email: 'junior@nsm.it' },
    update: {},
    create: { nome: 'Luca', cognome: 'Verdi', email: 'junior@nsm.it', ruolo: 'JUNIOR_AGENT', password: passwordHash },
  });

  console.log('✅ 5 Utenti NSM creati (ADMIN, BACKOFFICE_INTERNO, CAPO_AREA, AGENTE, JUNIOR_AGENT)');

  // ─── Clienti ──────────────────────────────────────────────────────────────
  const clientiData = [
    { ragione_sociale: 'Acme SRL', piva: '01234567890', email: 'info@acme.it', pec: 'acme@pec.it', telefono: '0111234567', citta: 'Torino', provincia: 'TO' },
    { ragione_sociale: 'Beta SpA', piva: '09876543210', email: 'amministrazione@betaspa.it', pec: 'beta@pec.it', telefono: '0223456789', citta: 'Milano', provincia: 'MI' },
    { ragione_sociale: 'Gamma SNC', piva: '11223344556', email: 'hello@gammasnc.it', pec: 'gamma@pec.it', telefono: '0334567890', citta: 'Roma', provincia: 'RM' },
    { ragione_sociale: 'Delta SAS', piva: '66554433221', email: 'delta@deltasas.it', pec: 'delta@pec.it', telefono: '0445678901', citta: 'Bologna', provincia: 'BO' },
    { ragione_sociale: 'Epsilon Studio', piva: '99887766554', email: 'studio@epsilon.it', pec: 'epsilon@pec.it', telefono: '0556789012', citta: 'Firenze', provincia: 'FI' },
  ];

  const clienti = await Promise.all(
    clientiData.map(c => prisma.cliente.upsert({ where: { piva: c.piva }, update: {}, create: c }))
  );

  console.log('✅ 5 Clienti creati');

  // ─── Contratti EOL ────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Dati contratti: scadenze a +30, +60, +90, +120, +150 giorni
  const contrattiConfig = [
    { nsmId: 'NSM-2024-101', grenkeId: 'G-FLEX-24-001', clienteIdx: 0, offsetGiorni: 30, riconciliazione: 'RICONCILIATO_AUTO',   canone: 85.00,  mesi: 36, agente: agente },
    { nsmId: 'NSM-2024-102', grenkeId: 'G-FLEX-24-002', clienteIdx: 1, offsetGiorni: 60, riconciliazione: 'RICONCILIATO_AUTO',   canone: 120.50, mesi: 24, agente: agente },
    { nsmId: 'NSM-2024-103', grenkeId: 'G-FLEX-24-003', clienteIdx: 2, offsetGiorni: 90, riconciliazione: 'RICONCILIATO_AUTO',   canone: 200.00, mesi: 48, agente: junior },
    { nsmId: 'NSM-2024-104', grenkeId: 'G-FLEX-24-004', clienteIdx: 3, offsetGiorni: 120, riconciliazione: 'OUTLIER_DA_GESTIRE', canone: 65.75,  mesi: 36, agente: agente },
    { nsmId: 'NSM-2024-105', grenkeId: 'G-FLEX-24-005', clienteIdx: 4, offsetGiorni: 150, riconciliazione: 'OUTLIER_DA_GESTIRE', canone: 310.00, mesi: 60, agente: junior },
  ];

  for (const cfg of contrattiConfig) {
    const monte_canoni = Number((cfg.canone * cfg.mesi).toFixed(2));
    const pricing_grenke = Number((monte_canoni * 0.05).toFixed(2));
    const pricing_riacquisto = Number((monte_canoni * 0.08).toFixed(2));
    const margine_lordo = Number((pricing_riacquisto - pricing_grenke).toFixed(2));
    const tagli = [25, 50, 75, 100, 125, 150, 200, 250, 300];
    let valore_gift_card = 0;
    for (const taglio of tagli) {
      if (taglio <= margine_lordo) {
        valore_gift_card = taglio;
      } else {
        break;
      }
    }
    const data_scadenza = addDays(today, cfg.offsetGiorni);
    const data_stipula = new Date(data_scadenza);
    data_stipula.setFullYear(data_stipula.getFullYear() - Math.floor(cfg.mesi / 12));

    await prisma.contratto_EOL.upsert({
      where: { contratto_nsm_id: cfg.nsmId },
      update: {},
      create: {
        contratto_nsm_id: cfg.nsmId,
        contratto_grenke_id: cfg.grenkeId,
        cliente_id: clienti[cfg.clienteIdx].id,
        data_stipula,
        data_scadenza,
        canone_mensile: cfg.canone,
        numero_mesi: cfg.mesi,
        monte_canoni,
        pricing_grenke,
        pricing_riacquisto,
        margine_lordo,
        valore_gift_card,
        stato: 'LISTA_RICEVUTA',
        origine: 'Smartcom',
        agente_originario_id: cfg.agente.id,
        agente_assegnato_id: cfg.agente.id,
        data_importazione: new Date(),
        stato_riconciliazione: cfg.riconciliazione,
        beni_json: JSON.stringify([
          { descrizione: 'Notebook aziendale', seriale: `SN-${cfg.grenkeId}`, marca: 'Lenovo', modello: 'ThinkPad X1' }
        ]),
        token_accesso_cliente: crypto.randomBytes(32).toString('hex'),
      },
    });
  }

  console.log('✅ 5 Contratti EOL creati (3 RICONCILIATO_AUTO + 2 OUTLIER_DA_GESTIRE)');
  console.log('   Scadenze distribuite a +30, +60, +90, +120, +150 giorni dalla data odierna');
  console.log('\n🎉 Seed completato con successo!');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
