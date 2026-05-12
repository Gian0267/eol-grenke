import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);

const prisma = new PrismaClient();

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateClienteToken(contrattoEolId: string, clienteId: string, dataScadenza: Date): string {
  const exp = Math.floor((dataScadenza.getTime() - JWT_EXPIRES_OFFSET_DAYS * 86400000) / 1000);
  return jwt.sign(
    { contratto_eol_id: contrattoEolId, cliente_id: clienteId, exp },
    JWT_SECRET,
  );
}

const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

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
    create: {
      id: BACKOFFICE_USER_ID,
      nome: 'Sofia',
      cognome: 'Ferraris',
      email: 'backoffice@nsm.it',
      ruolo: 'BACKOFFICE_INTERNO',
      password: passwordHash,
    },
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
  console.log(`   Backoffice user ID fisso: ${BACKOFFICE_USER_ID}`);

  // ─── Clienti originali (5) ────────────────────────────────────────────────
  const clientiOriginali = [
    { ragione_sociale: 'Acme SRL', piva: '01234567890', email: 'info@acme.it', pec: 'acme@pec.it', telefono: '0111234567', citta: 'Torino', provincia: 'TO' },
    { ragione_sociale: 'Beta SpA', piva: '09876543210', email: 'amministrazione@betaspa.it', pec: 'beta@pec.it', telefono: '0223456789', citta: 'Milano', provincia: 'MI' },
    { ragione_sociale: 'Gamma SNC', piva: '11223344556', email: 'hello@gammasnc.it', pec: 'gamma@pec.it', telefono: '0334567890', citta: 'Roma', provincia: 'RM' },
    { ragione_sociale: 'Delta SAS', piva: '66554433221', email: 'delta@deltasas.it', pec: 'delta@pec.it', telefono: '0445678901', citta: 'Bologna', provincia: 'BO' },
    { ragione_sociale: 'Epsilon Studio', piva: '99887766554', email: 'studio@epsilon.it', pec: 'epsilon@pec.it', telefono: '0556789012', citta: 'Firenze', provincia: 'FI' },
  ];

  const clienti = await Promise.all(
    clientiOriginali.map(c => prisma.cliente.upsert({ where: { piva: c.piva }, update: {}, create: c }))
  );

  console.log('✅ 5 Clienti originali creati');

  // ─── 23 Clienti aggiuntivi per riconciliazione ────────────────────────────
  const clientiExtra = [
    { ragione_sociale: 'Zeta Informatica SRL', piva: '10000000001', email: 'info@zetainformatica.it', pec: 'zeta@pec.it', telefono: '0667890123', citta: 'Napoli', provincia: 'NA' },
    { ragione_sociale: 'Eta Consulting SPA', piva: '10000000002', email: 'admin@etaconsulting.it', pec: 'eta@pec.it', telefono: '0778901234', citta: 'Genova', provincia: 'GE' },
    { ragione_sociale: 'Theta Tech SRL', piva: '10000000003', email: 'info@thetatech.it', pec: 'theta@pec.it', telefono: '0889012345', citta: 'Palermo', provincia: 'PA' },
    { ragione_sociale: 'Iota Design Studio', piva: '10000000004', email: 'studio@iotadesign.it', pec: 'iota@pec.it', telefono: '0990123456', citta: 'Bari', provincia: 'BA' },
    { ragione_sociale: 'Kappa Services SAS', piva: '10000000005', email: 'info@kappaservices.it', pec: 'kappa@pec.it', telefono: '0101234567', citta: 'Catania', provincia: 'CT' },
    { ragione_sociale: 'Lambda Solutions SRL', piva: '10000000006', email: 'info@lambdasolutions.it', pec: 'lambda@pec.it', telefono: '0112345678', citta: 'Verona', provincia: 'VR' },
    { ragione_sociale: 'Mu Engineering SPA', piva: '10000000007', email: 'admin@muengineering.it', pec: 'mu@pec.it', telefono: '0123456789', citta: 'Padova', provincia: 'PD' },
    { ragione_sociale: 'Nu Digital SRL', piva: '10000000008', email: 'info@nudigital.it', pec: 'nu@pec.it', telefono: '0134567890', citta: 'Trieste', provincia: 'TS' },
    { ragione_sociale: 'Xi Media Group', piva: '10000000009', email: 'contact@ximediagroup.it', pec: 'xi@pec.it', telefono: '0145678901', citta: 'Brescia', provincia: 'BS' },
    { ragione_sociale: 'Omicron Logistics SRL', piva: '10000000010', email: 'info@omicronlogistics.it', pec: 'omicron@pec.it', telefono: '0156789012', citta: 'Taranto', provincia: 'TA' },
    { ragione_sociale: 'Pi Software SAS', piva: '10000000011', email: 'dev@pisoftware.it', pec: 'pi@pec.it', telefono: '0167890123', citta: 'Modena', provincia: 'MO' },
    { ragione_sociale: 'Rho Costruzioni SRL', piva: '10000000012', email: 'info@rhocostruzioni.it', pec: 'rho@pec.it', telefono: '0178901234', citta: 'Reggio Emilia', provincia: 'RE' },
    { ragione_sociale: 'Sigma Finance SPA', piva: '10000000013', email: 'admin@sigmafinance.it', pec: 'sigma@pec.it', telefono: '0189012345', citta: 'Parma', provincia: 'PR' },
    { ragione_sociale: 'Tau Energia SRL', piva: '10000000014', email: 'info@tauenergia.it', pec: 'tau@pec.it', telefono: '0190123456', citta: 'Perugia', provincia: 'PG' },
    { ragione_sociale: 'Upsilon Pharma SRL', piva: '10000000015', email: 'info@upsilonpharma.it', pec: 'upsilon@pec.it', telefono: '0201234567', citta: 'Cagliari', provincia: 'CA' },
    { ragione_sociale: 'Phi Architettura Studio', piva: '10000000016', email: 'studio@phiarchitettura.it', pec: 'phi@pec.it', telefono: '0212345678', citta: 'Messina', provincia: 'ME' },
    { ragione_sociale: 'Chi Marketing SRL', piva: '10000000017', email: 'info@chimarketing.it', pec: 'chi@pec.it', telefono: '0223456780', citta: 'Livorno', provincia: 'LI' },
    { ragione_sociale: 'Psi Robotics SPA', piva: '10000000018', email: 'admin@psirobotics.it', pec: 'psi@pec.it', telefono: '0234567891', citta: 'Bergamo', provincia: 'BG' },
    { ragione_sociale: 'Omega Trading SRL', piva: '10000000019', email: 'info@omegatrading.it', pec: 'omega@pec.it', telefono: '0245678902', citta: 'Vicenza', provincia: 'VI' },
    { ragione_sociale: 'Alpha Due SAS', piva: '10000000020', email: 'info@alphadue.it', pec: 'alphadue@pec.it', telefono: '0256789013', citta: 'Novara', provincia: 'NO' },
    { ragione_sociale: 'Beta Seconda SRL', piva: '10000000021', email: 'info@betaseconda.it', pec: 'betaseconda@pec.it', telefono: '0267890124', citta: 'Piacenza', provincia: 'PC' },
    { ragione_sociale: 'Gamma Plus SPA', piva: '10000000022', email: 'admin@gammaplus.it', pec: 'gammaplus@pec.it', telefono: '0278901235', citta: 'Ancona', provincia: 'AN' },
    { ragione_sociale: 'Delta Tech SRL', piva: '10000000023', email: 'info@deltatech.it', pec: 'deltatech@pec.it', telefono: '0289012346', citta: 'Pescara', provincia: 'PE' },
  ];

  const clientiExtraCreated = await Promise.all(
    clientiExtra.map(c => prisma.cliente.upsert({ where: { piva: c.piva }, update: {}, create: c }))
  );

  console.log('✅ 23 Clienti aggiuntivi creati');

  // ─── Tutti i 28 clienti in un array ───────────────────────────────────────
  const tuttiClienti = [...clienti, ...clientiExtraCreated];

  // ─── Contratti EOL originali (5) ──────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const contrattiOriginali = [
    { nsmId: 'NSM-2024-101', grenkeId: 'G-FLEX-24-001', clienteIdx: 0, offsetGiorni: 30, riconciliazione: 'RICONCILIATO_AUTO', canone: 85.00, mesi: 36, agenteRef: agente },
    { nsmId: 'NSM-2024-102', grenkeId: 'G-FLEX-24-002', clienteIdx: 1, offsetGiorni: 60, riconciliazione: 'RICONCILIATO_AUTO', canone: 120.50, mesi: 24, agenteRef: agente },
    { nsmId: 'NSM-2024-103', grenkeId: 'G-FLEX-24-003', clienteIdx: 2, offsetGiorni: 90, riconciliazione: 'RICONCILIATO_AUTO', canone: 200.00, mesi: 48, agenteRef: junior },
    { nsmId: 'NSM-2024-104', grenkeId: 'G-FLEX-24-004', clienteIdx: 3, offsetGiorni: 120, riconciliazione: 'OUTLIER_DA_GESTIRE', canone: 65.75, mesi: 36, agenteRef: agente },
    { nsmId: 'NSM-2024-105', grenkeId: 'G-FLEX-24-005', clienteIdx: 4, offsetGiorni: 150, riconciliazione: 'OUTLIER_DA_GESTIRE', canone: 310.00, mesi: 60, agenteRef: junior },
  ];

  for (const cfg of contrattiOriginali) {
    const monte_canoni = Number((cfg.canone * cfg.mesi).toFixed(2));
    const pricing_grenke = Number((monte_canoni * 0.05).toFixed(2));
    const pricing_riacquisto = Number((monte_canoni * 0.08).toFixed(2));
    const margine_lordo = Number((pricing_riacquisto - pricing_grenke).toFixed(2));
    const tagli = [25, 50, 75, 100, 125, 150, 200, 250, 300];
    let valore_gift_card = 0;
    for (const taglio of tagli) {
      if (taglio <= margine_lordo) valore_gift_card = taglio;
      else break;
    }
    const data_scadenza = addDays(today, cfg.offsetGiorni);
    const data_stipula = new Date(data_scadenza);
    data_stipula.setFullYear(data_stipula.getFullYear() - Math.floor(cfg.mesi / 12));

    const contrattoId = crypto.randomUUID();

    await prisma.contratto_EOL.upsert({
      where: { contratto_nsm_id: cfg.nsmId },
      update: {},
      create: {
        id: contrattoId,
        contratto_nsm_id: cfg.nsmId,
        contratto_grenke_id: cfg.grenkeId,
        cliente_id: clienti[cfg.clienteIdx]!.id,
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
        agente_originario_id: cfg.agenteRef.id,
        agente_assegnato_id: cfg.agenteRef.id,
        data_importazione: new Date(),
        stato_riconciliazione: cfg.riconciliazione,
        beni_json: JSON.stringify([{ descrizione: 'Notebook aziendale', seriale: `SN-${cfg.grenkeId}`, marca: 'Lenovo', modello: 'ThinkPad X1' }]),
        token_accesso_cliente: generateClienteToken(contrattoId, clienti[cfg.clienteIdx]!.id, data_scadenza),
      },
    });
  }

  console.log('✅ 5 Contratti EOL originali creati (3 RICONCILIATO_AUTO + 2 OUTLIER_DA_GESTIRE)');

  // ─── 23 Contratti FLEX_ATTIVO (preesistenti in piattaforma) ───────────────
  const durate = [36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 48, 48, 48, 48, 24, 24, 24, 24];
  const canoni = [45, 55, 60, 65, 70, 72, 75, 78, 80, 42, 50, 68, 90, 95, 110, 85, 100, 130, 140, 48, 55, 62, 88];

  for (let i = 0; i < 23; i++) {
    const idx = i;
    const grenkeId = `G-FLEX-24-${String(i + 6).padStart(3, '0')}`;
    const nsmId = `NSM-2024-${200 + i}`;
    const offsetGiorni = 30 + Math.round((150 / 22) * i);
    const data_scadenza = addDays(today, offsetGiorni);
    const mesi = durate[i]!;
    const canone = canoni[i]!;
    const data_stipula = new Date(data_scadenza);
    data_stipula.setFullYear(data_stipula.getFullYear() - Math.floor(mesi / 12));

    const monte_canoni = Number((canone * mesi).toFixed(2));
    const pricing_grenke = Number((monte_canoni * 0.05).toFixed(2));
    const pricing_riacquisto = Number((monte_canoni * 0.08).toFixed(2));
    const margine_lordo = Number((pricing_riacquisto - pricing_grenke).toFixed(2));
    const tagli = [25, 50, 75, 100, 125, 150, 200, 250, 300];
    let valore_gift_card = 0;
    for (const taglio of tagli) {
      if (taglio <= margine_lordo) valore_gift_card = taglio;
      else break;
    }

    const clienteRef = tuttiClienti[5 + idx]!;
    const agenteRef = idx % 2 === 0 ? agente : junior;
    const contrattoId = crypto.randomUUID();

    await prisma.contratto_EOL.upsert({
      where: { contratto_nsm_id: nsmId },
      update: {},
      create: {
        id: contrattoId,
        contratto_nsm_id: nsmId,
        contratto_grenke_id: grenkeId,
        cliente_id: clienteRef.id,
        data_stipula,
        data_scadenza,
        canone_mensile: canone,
        numero_mesi: mesi,
        monte_canoni,
        pricing_grenke,
        pricing_riacquisto,
        margine_lordo,
        valore_gift_card,
        stato: 'FLEX_ATTIVO',
        origine: 'Smartcom',
        agente_originario_id: agenteRef.id,
        agente_assegnato_id: agenteRef.id,
        data_importazione: new Date(),
        stato_riconciliazione: 'RICONCILIATO_AUTO',
        beni_json: JSON.stringify([{ descrizione: `Apparecchiatura IT #${i + 6}`, marca: 'HP', modello: `EliteBook ${800 + i}` }]),
        token_accesso_cliente: generateClienteToken(contrattoId, clienteRef.id, data_scadenza),
      },
    });
  }

  console.log('✅ 23 Contratti FLEX_ATTIVO creati (preesistenti in piattaforma, per riconciliazione)');
  console.log('   GrenkeIDs: G-FLEX-24-006 ... G-FLEX-24-028');
  console.log('   Totale contratti con grenkeId matchabile: 28 (5 originali + 23 FLEX_ATTIVO)');
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
