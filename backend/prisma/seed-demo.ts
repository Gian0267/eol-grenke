/**
 * seed-demo.ts — Prepara il DB per una demo completa di 15 minuti.
 *
 * NOTA COMPLIANCE FISCALE:
 * Il template genera RICEVUTE DI CONFERMA PAGAMENTO, NON fatture fiscali.
 * Le fatture elettroniche vengono emesse dall'ERP aziendale via SDI.
 * Questo script crea dati demo coerenti con questa architettura.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import { PrismaClient, Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const prisma = new PrismaClient();

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function genToken(contrattoEolId: string, clienteId: string, dataScadenza: Date): string {
  const exp = Math.floor((dataScadenza.getTime() + 365 * 86400000) / 1000);
  return jwt.sign({ contratto_eol_id: contrattoEolId, cliente_id: clienteId, exp }, JWT_SECRET);
}

function calcHash(timestamp: string, attoreId: string, azione: string, datiJson: string, prev: string): string {
  return crypto.createHash('sha256').update(`${timestamp}|${attoreId}|${azione}|${datiJson}|${prev}`).digest('hex');
}

async function addAudit(contrattoId: string, attoreTipo: string, attoreId: string, azione: string, dati: Record<string, unknown>, prevHash: string): Promise<string> {
  const ts = new Date().toISOString();
  const datiJson = JSON.stringify(dati);
  const hash = calcHash(ts, attoreId, azione, datiJson, prevHash);
  await prisma.audit_Event.create({
    data: {
      contratto_eol_id: contrattoId,
      timestamp: new Date(ts),
      attore_tipo: attoreTipo,
      attore_id: attoreId,
      azione,
      dati_json: datiJson,
      hash_precedente: prevHash,
      hash_corrente: hash,
    },
  });
  return hash;
}

function calcPricing(canone: number, mesi: number) {
  const monte_canoni = Number((canone * mesi).toFixed(2));
  const pricing_grenke = Number((monte_canoni * 0.05).toFixed(2));
  const pricing_riacquisto = Number((monte_canoni * 0.08).toFixed(2));
  const margine_lordo = Number((pricing_riacquisto - pricing_grenke).toFixed(2));
  const tagli = [25, 50, 75, 100, 125, 150, 200, 250, 300];
  let valore_gift_card = 0;
  for (const t of tagli) { if (t <= margine_lordo) valore_gift_card = t; else break; }
  return { monte_canoni, pricing_grenke, pricing_riacquisto, margine_lordo, valore_gift_card };
}

interface DemoScenario {
  idx: number;
  grenkeId: string;
  ragione_sociale: string;
  piva: string;
  email: string;
  canone: number;
  mesi: number;
  scadenzaOffset: number;
  stato: string;
  descrizione: string;
}

const scenarios: DemoScenario[] = [
  { idx: 1, grenkeId: 'DEMO-001', ragione_sociale: 'Studio Legale Bianchi', piva: '20000000001', email: 'demo1@example.it', canone: 95, mesi: 36, scadenzaOffset: 150, stato: 'LISTA_RICEVUTA', descrizione: 'Appena importato, T-150. Nessuna comunicazione inviata.' },
  { idx: 2, grenkeId: 'DEMO-002', ragione_sociale: 'Tecnoprint SRL', piva: '20000000002', email: 'demo2@example.it', canone: 120, mesi: 36, scadenzaOffset: 150, stato: 'LISTA_RICEVUTA', descrizione: 'Appena importato, T-150. Nessuna comunicazione inviata.' },
  { idx: 3, grenkeId: 'DEMO-003', ragione_sociale: 'Ristorante Da Mario SAS', piva: '20000000003', email: 'demo3@example.it', canone: 80, mesi: 24, scadenzaOffset: 90, stato: 'COMUNICAZIONE_INVIATA', descrizione: 'Comunicazione inviata, T-90. Primo sollecito schedulato.' },
  { idx: 4, grenkeId: 'DEMO-004', ragione_sociale: 'Farmacia Centrale SNC', piva: '20000000004', email: 'demo4@example.it', canone: 200, mesi: 48, scadenzaOffset: 90, stato: 'COMUNICAZIONE_INVIATA', descrizione: 'Comunicazione inviata, T-90. Primo sollecito schedulato.' },
  { idx: 5, grenkeId: 'DEMO-005', ragione_sociale: 'Ottica Visione SRL', piva: '20000000005', email: 'demo5@example.it', canone: 150, mesi: 36, scadenzaOffset: 60, stato: 'IN_ATTESA_DECISIONE', descrizione: 'Sollecito 2 inviato, T-60. Cliente ha aperto il link.' },
  { idx: 6, grenkeId: 'DEMO-006', ragione_sociale: 'Autoricambi Veloci SPA', piva: '20000000006', email: 'demo6@example.it', canone: 250, mesi: 48, scadenzaOffset: 60, stato: 'IN_ATTESA_DECISIONE', descrizione: 'Sollecito 2 inviato, T-60. Cliente ha aperto il link.' },
  { idx: 7, grenkeId: 'DEMO-007', ragione_sociale: 'Palestra FitPro SRL', piva: '20000000007', email: 'demo7@example.it', canone: 110, mesi: 36, scadenzaOffset: 50, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-50, task escalation telefonica creato.' },
  { idx: 8, grenkeId: 'DEMO-008', ragione_sociale: 'Edilizia Moderna SRL', piva: '20000000008', email: 'demo8@example.it', canone: 180, mesi: 36, scadenzaOffset: 50, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-50, task escalation telefonica creato.' },
  { idx: 9, grenkeId: 'DEMO-009', ragione_sociale: 'Agenzia Viaggi Mondo', piva: '20000000009', email: 'demo9@example.it', canone: 75, mesi: 24, scadenzaOffset: 35, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-35, URGENTE. Ultimo sollecito inviato.' },
  { idx: 10, grenkeId: 'DEMO-010', ragione_sociale: 'Sartoria Elegante SAS', piva: '20000000010', email: 'demo10@example.it', canone: 65, mesi: 24, scadenzaOffset: 35, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-35, URGENTE. Ultimo sollecito inviato.' },
  { idx: 11, grenkeId: 'DEMO-011', ragione_sociale: 'Laboratorio Analisi MedLab', piva: '20000000011', email: 'demo11@example.it', canone: 300, mesi: 48, scadenzaOffset: 7, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-7, quasi scaduto. Rischio silenzio ALTO.' },
  { idx: 12, grenkeId: 'DEMO-012', ragione_sociale: 'Panificio Artisan SNC', piva: '20000000012', email: 'demo12@example.it', canone: 55, mesi: 24, scadenzaOffset: 7, stato: 'IN_ATTESA_DECISIONE', descrizione: 'T-7, quasi scaduto. Rischio silenzio ALTO.' },
  { idx: 13, grenkeId: 'DEMO-013', ragione_sociale: 'Grafica Creativa SRL', piva: '20000000013', email: 'demo13@example.it', canone: 160, mesi: 36, scadenzaOffset: 45, stato: 'DECISIONE_RINNOVO', descrizione: 'Ha scelto RINNOVO. Agente deve contattare.' },
  { idx: 14, grenkeId: 'DEMO-014', ragione_sociale: 'Officina Meccanica Turbo', piva: '20000000014', email: 'demo14@example.it', canone: 220, mesi: 48, scadenzaOffset: 30, stato: 'RIACQUISTO_PAGATO', descrizione: 'Riacquisto completato e pagato. Pronto per export Grenke.' },
  { idx: 15, grenkeId: 'DEMO-015', ragione_sociale: 'Cartoleria Il Quaderno', piva: '20000000015', email: 'demo15@example.it', canone: 45, mesi: 24, scadenzaOffset: 20, stato: 'CHIUSA_RESTITUZIONE_CONFERMATA', descrizione: 'Restituzione confermata. Pratica chiusa.' },
];

async function main() {
  console.log('=== SEED DEMO — Reset e creazione 15 contratti demo ===\n');
  console.log('NOTA: Il template genera ricevute di pagamento, NON fatture fiscali.');
  console.log('Le fatture elettroniche vengono emesse dall\'ERP aziendale via SDI.\n');

  // Reset dati EOL (non utenti)
  console.log('Pulizia dati EOL esistenti...');
  await prisma.audit_Event.deleteMany({});
  await prisma.task_Escalation.deleteMany({});
  await prisma.comunicazione.deleteMany({});
  await prisma.richiesta_Contatto.deleteMany({});
  await prisma.pagamento.deleteMany({});
  await prisma.decisione_Cliente.deleteMany({});
  await prisma.contratto_EOL.deleteMany({});
  await prisma.otpCode.deleteMany({});
  console.log('OK\n');

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const agente = await prisma.utente_NSM.findFirst({ where: { ruolo: 'AGENTE', attivo: true } });
  const backoffice = await prisma.utente_NSM.findFirst({ where: { ruolo: 'BACKOFFICE_INTERNO', attivo: true } });
  if (!agente || !backoffice) {
    console.error('Esegui prima seed.ts per creare gli utenti NSM');
    process.exit(1);
  }

  const links: string[] = [];
  links.push('# DEMO LINKS\n');
  links.push('> Generato da seed-demo.ts\n');
  links.push('> **NOTA COMPLIANCE FISCALE:** Il template genera ricevute di conferma pagamento,');
  links.push('> NON fatture fiscali. Le fatture elettroniche vengono emesse dall\'ERP aziendale via SDI.\n');
  links.push('## Credenziali backoffice\n');
  links.push('| Ruolo | Email | Password |');
  links.push('|---|---|---|');
  links.push('| ADMIN | admin@nsm.it | test1234 |');
  links.push('| BACKOFFICE | backoffice@nsm.it | test1234 |');
  links.push('| CAPO AREA | capoarea@nsm.it | test1234 |');
  links.push('| AGENTE | agente@nsm.it | test1234 |');
  links.push('| JUNIOR | junior@nsm.it | test1234 |');
  links.push(`\nBackoffice URL: ${FRONTEND_URL}/backoffice\n`);
  links.push('## Link area cliente\n');
  links.push('| # | Scenario | Stato | Link |');
  links.push('|---|---|---|---|');

  for (const s of scenarios) {
    const cliente = await prisma.cliente.upsert({
      where: { piva: s.piva },
      update: {},
      create: {
        ragione_sociale: s.ragione_sociale,
        piva: s.piva,
        email: s.email,
        pec: `demo${s.idx}@pec.it`,
        telefono: `011${String(s.idx).padStart(7, '0')}`,
        citta: 'Torino',
        provincia: 'TO',
      },
    });

    const dataScadenza = addDays(today, s.scadenzaOffset);
    const dataStipula = new Date(dataScadenza);
    dataStipula.setFullYear(dataStipula.getFullYear() - Math.floor(s.mesi / 12));

    const p = calcPricing(s.canone, s.mesi);
    const contrattoId = crypto.randomUUID();
    const nsmId = `NSM-DEMO-${String(s.idx).padStart(3, '0')}`;

    const token = genToken(contrattoId, cliente.id, dataScadenza);

    await prisma.contratto_EOL.create({
      data: {
        id: contrattoId,
        contratto_nsm_id: nsmId,
        contratto_grenke_id: s.grenkeId,
        cliente_id: cliente.id,
        data_stipula: dataStipula,
        data_scadenza: dataScadenza,
        canone_mensile: s.canone,
        numero_mesi: s.mesi,
        monte_canoni: p.monte_canoni,
        pricing_grenke: p.pricing_grenke,
        pricing_riacquisto: p.pricing_riacquisto,
        margine_lordo: p.margine_lordo,
        valore_gift_card: p.valore_gift_card,
        stato: s.stato,
        origine: 'Smartcom',
        agente_originario_id: agente.id,
        agente_assegnato_id: agente.id,
        data_importazione: addDays(today, -(180 - s.scadenzaOffset)),
        stato_riconciliazione: 'RICONCILIATO_AUTO',
        beni_json: JSON.stringify([{ descrizione: `Notebook aziendale #${s.idx}`, marca: 'Apple', modello: 'MacBook Air M3' }]),
        token_accesso_cliente: token,
      },
    });

    // Audit trail
    let lastHash = 'GENESIS';
    lastHash = await addAudit(contrattoId, 'BACKOFFICE', backoffice.id, 'PRATICA_CREATA', { origine: 'IMPORTAZIONE_EXCEL' }, lastHash);

    if (s.stato !== 'LISTA_RICEVUTA') {
      lastHash = await addAudit(contrattoId, 'SISTEMA', 'EMAIL_SERVICE', 'COMUNICAZIONE_INVIATA', { tipo: 'COMUNICAZIONE_INIZIALE' }, lastHash);
      await prisma.comunicazione.create({
        data: { contratto_eol_id: contrattoId, tipo: 'COMUNICAZIONE_INIZIALE', canale: 'EMAIL', destinatario: s.email, oggetto: `Comunicazione contratto ${nsmId}`, data_invio: addDays(today, -(170 - s.scadenzaOffset)), esito_invio: 'INVIATO' },
      });
    }

    if (['IN_ATTESA_DECISIONE', 'DECISIONE_RINNOVO', 'RIACQUISTO_PAGATO', 'CHIUSA_RESTITUZIONE_CONFERMATA'].includes(s.stato)) {
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'LINK_APERTO_DAL_CLIENTE', { ip: '192.168.1.100' }, lastHash);
    }

    // Escalation for T-50
    if (s.scadenzaOffset === 50) {
      const task = await prisma.task_Escalation.create({
        data: { contratto_eol_id: contrattoId, tipo: 'T_50', assegnato_a_id: agente.id, stato: 'DA_CHIAMARE' },
      });
      lastHash = await addAudit(contrattoId, 'SISTEMA', 'SCHEDULER', 'TASK_ESCALATION_CREATO', { tipo: 'T_50', task_id: task.id }, lastHash);
    }

    // Decisione rinnovo
    if (s.stato === 'DECISIONE_RINNOVO') {
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'OTP_VERIFICATO', { metodo: 'EMAIL', opzione: 'RINNOVO' }, lastHash);
      await prisma.decisione_Cliente.create({
        data: { contratto_eol_id: contrattoId, opzione_scelta: 'RINNOVO', otp_verificato: true, otp_metodo: 'EMAIL', note_cliente: JSON.stringify({ tipo_device: 'Apple MacBook', numero_device: 2, durata_desiderata: 36 }) },
      });
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'DECISIONE_PRESA', { opzione: 'RINNOVO' }, lastHash);
    }

    // Riacquisto pagato
    if (s.stato === 'RIACQUISTO_PAGATO') {
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'OTP_VERIFICATO', { metodo: 'EMAIL', opzione: 'RIACQUISTO' }, lastHash);
      await prisma.decisione_Cliente.create({
        data: { contratto_eol_id: contrattoId, opzione_scelta: 'RIACQUISTO', otp_verificato: true, otp_metodo: 'EMAIL' },
      });
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'DECISIONE_PRESA', { opzione: 'RIACQUISTO' }, lastHash);

      const importi = { netto: p.pricing_riacquisto, iva: Number((p.pricing_riacquisto * 0.22).toFixed(2)), totale: Number((p.pricing_riacquisto * 1.22).toFixed(2)) };
      const sessionId = `demo-session-${s.idx}`;
      await prisma.pagamento.create({
        data: {
          contratto_eol_id: contrattoId,
          importo_netto: new Prisma.Decimal(importi.netto),
          importo_iva: new Prisma.Decimal(importi.iva),
          importo_totale: new Prisma.Decimal(importi.totale),
          metodo: 'STRIPE',
          stato: 'COMPLETATO',
          session_id: sessionId,
          riferimento_transazione: `demo-txn-${s.idx}`,
          data_completato: addDays(today, -5),
          natura_giuridica: 'ACCONTO',
        },
      });
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'PAGAMENTO_INIZIATO', { metodo: 'STRIPE', session_id: sessionId }, lastHash);
      lastHash = await addAudit(contrattoId, 'SISTEMA', 'STRIPE', 'PAGAMENTO_COMPLETATO', { session_id: sessionId, importo_totale: importi.totale }, lastHash);
    }

    // Restituzione confermata
    if (s.stato === 'CHIUSA_RESTITUZIONE_CONFERMATA') {
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'OTP_VERIFICATO', { metodo: 'SMS', opzione: 'RESTITUZIONE' }, lastHash);
      await prisma.decisione_Cliente.create({
        data: { contratto_eol_id: contrattoId, opzione_scelta: 'RESTITUZIONE', otp_verificato: true, otp_metodo: 'SMS' },
      });
      lastHash = await addAudit(contrattoId, 'CLIENTE', cliente.id, 'DECISIONE_PRESA', { opzione: 'RESTITUZIONE' }, lastHash);
      lastHash = await addAudit(contrattoId, 'SISTEMA', 'SISTEMA', 'PRATICA_CHIUSA', { stato_finale: 'CHIUSA_RESTITUZIONE_CONFERMATA' }, lastHash);
    }

    const link = `${FRONTEND_URL}/pratica/${token}`;
    links.push(`| ${s.idx} | ${s.ragione_sociale} | ${s.stato} | [Apri](${link}) |`);
    console.log(`  [${s.idx}/15] ${nsmId} — ${s.stato} — ${s.descrizione}`);
  }

  links.push('\n## Descrizione scenari\n');
  for (const s of scenarios) {
    links.push(`**${s.idx}. ${s.ragione_sociale}** (${s.grenkeId}) — ${s.descrizione}\n`);
  }

  // Scrivi DEMO_LINKS.md nella root del progetto
  const demoLinksPath = resolve(__dirname, '../../DEMO_LINKS.md');
  writeFileSync(demoLinksPath, links.join('\n') + '\n', 'utf-8');

  console.log('\n=== DEMO SEED COMPLETATO ===\n');
  console.log(`File generato: ${demoLinksPath}\n`);
  console.log(links.join('\n'));
}

main()
  .catch(e => { console.error('Errore seed-demo:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
