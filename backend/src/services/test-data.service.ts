import * as XLSX from 'xlsx';
import { prisma } from '../lib/db.js';

/**
 * SOLO PER LA FASE DI TEST — da rimuovere prima della produzione effettiva.
 *
 * Svuota tutti i dati operativi (pratiche, decisioni, pagamenti, comunicazioni,
 * audit, OTP, escalation, clienti) e genera DUE file Excel di test da usare
 * con l'import combinato:
 *   1. lista Grenke (9 colonne) — 15 contratti + 1 senza dati NSM (eccezione)
 *   2. export piattaforma NSM — gli stessi 15 contratti con dispositivi e
 *      canoni + 2 contratti extra NON presenti nel file Grenke (scartati)
 *
 * NON tocca: Utente_NSM (utenti e password) e Impostazione (configurazione).
 * Nessun contratto viene pre-creato: tutto entra dall'import combinato.
 *
 * Le email dei clienti di test usano il pattern g.ciardo+eolNN@gmail.com:
 * Gmail le recapita tutte nella casella g.ciardo@gmail.com. La PEC è un alias
 * fittizio (+eolNNpec); con TEST_MAIL_REDIRECT gli invii PEC sono simulati
 * via email ordinaria — nessuna PEC reale consumata.
 */

const AZIENDE_TEST = [
  { nome: 'Alfa Consulting SRL',      piva: '11111111101', citta: 'Torino',   provincia: 'TO' },
  { nome: 'Borgo Digitale SNC',       piva: '11111111102', citta: 'Milano',   provincia: 'MI' },
  { nome: 'Cartesio Engineering SPA', piva: '11111111103', citta: 'Bologna',  provincia: 'BO' },
  { nome: 'Delta Vision SRL',         piva: '11111111104', citta: 'Roma',     provincia: 'RM' },
  { nome: 'Euclide Software SRLS',    piva: '11111111105', citta: 'Firenze',  provincia: 'FI' },
  { nome: 'Fenice Group SRL',         piva: '11111111106', citta: 'Napoli',   provincia: 'NA' },
  { nome: 'Galileo Lab SNC',          piva: '11111111107', citta: 'Genova',   provincia: 'GE' },
  { nome: 'Hermes Logistics SRL',     piva: '11111111108', citta: 'Verona',   provincia: 'VR' },
  { nome: 'Icaro Media SRLS',         piva: '11111111109', citta: 'Padova',   provincia: 'PD' },
  { nome: 'Janus Security SRL',       piva: '11111111110', citta: 'Brescia',  provincia: 'BS' },
  { nome: 'Kepler Analytics SPA',     piva: '11111111111', citta: 'Bari',     provincia: 'BA' },
  { nome: 'Levante Trade SRL',        piva: '11111111112', citta: 'Palermo',  provincia: 'PA' },
  { nome: 'Minerva Studio SNC',       piva: '11111111113', citta: 'Trento',   provincia: 'TN' },
  { nome: 'Nettuno Marine SRL',       piva: '11111111114', citta: 'Cagliari', provincia: 'CA' },
  { nome: 'Orione Robotics SPA',      piva: '11111111115', citta: 'Modena',   provincia: 'MO' },
  // extra solo nel file NSM (devono risultare "scartati" all'import)
  { nome: 'Pegaso Innovazione SRL',   piva: '11111111116', citta: 'Ancona',   provincia: 'AN' },
  { nome: 'Quasar Servizi SNC',       piva: '11111111117', citta: 'Perugia',  provincia: 'PG' },
];

// Giorni alla scadenza: coprono le fasce escalation (31-50), i solleciti e le fasi iniziali
const GIORNI_SCADENZA = [32, 34, 38, 42, 47, 55, 62, 70, 80, 92, 105, 120, 135, 150, 165, 90, 100];

const DEVICE_TEST = [
  { descrizione: 'iPhone 17 Pro 256GB Deep Blue', prezzo: 42.07, servizi: 0 },
  { descrizione: 'MacBook Air M4 13" Midnight', prezzo: 38.5, servizi: 4.33 },
  { descrizione: 'iPad Pro 11" M5 Space Black', prezzo: 29.9, servizi: 0 },
  { descrizione: 'Galaxy S26 12+256Gb Black', prezzo: 25.22, servizi: 6.16 },
  { descrizione: 'iPhone 17 Pro Max 512GB Cosmic Orange', prezzo: 56.25, servizi: 4.33 },
];

const MESI_TEST = [24, 36, 48, 24, 36, 48, 36, 24, 48, 36, 24, 36, 48, 36, 24, 36, 36];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDateIt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface ResetTestDataResult {
  files: Array<{ filename: string; base64: string }>;
  contratti_importabili: number;
  record_eliminati: Record<string, number>;
}

export async function resetTestData(): Promise<ResetTestDataResult> {
  // 1) Svuota i dati operativi in ordine FK-safe (utenti e impostazioni esclusi)
  const [otp, task, richieste, pagamenti, decisioni, comunicazioni, audit, contratti, clienti, counter] =
    await prisma.$transaction([
      prisma.otpCode.deleteMany(),
      prisma.task_Escalation.deleteMany(),
      prisma.richiesta_Contatto.deleteMany(),
      prisma.pagamento.deleteMany(),
      prisma.decisione_Cliente.deleteMany(),
      prisma.comunicazione.deleteMany(),
      prisma.audit_Event.deleteMany(),
      prisma.contratto_EOL.deleteMany(),
      prisma.cliente.deleteMany(),
      prisma.counter.deleteMany(),
    ]);

  // 2) Prepara i dati dei 17 contratti (15 in entrambi i file, 2 solo NSM)
  const oggi = new Date();
  const anno = oggi.getFullYear();
  const grenkeRows: Record<string, string | number>[] = [];
  // Il file NSM è per-dispositivo, con le colonne del tracciato export (50 col.)
  const nsmHeader: unknown[] = new Array(50).fill('');
  nsmHeader[0] = 'Agenzia'; nsmHeader[1] = 'Agente'; nsmHeader[4] = 'Finanziaria';
  nsmHeader[5] = 'Numero contratto'; nsmHeader[6] = 'Numero contratto';
  nsmHeader[13] = 'Numero rate'; nsmHeader[14] = 'Ragione sociale cliente';
  nsmHeader[16] = 'partita IVA'; nsmHeader[17] = 'Codice fiscale';
  nsmHeader[18] = 'Indirizzo'; nsmHeader[19] = 'Città'; nsmHeader[20] = 'CAP'; nsmHeader[21] = 'Provincia';
  nsmHeader[22] = 'Email'; nsmHeader[23] = 'Pec'; nsmHeader[24] = 'Telefono';
  nsmHeader[26] = 'Nome Firmatario'; nsmHeader[27] = 'Cognome Firmatario'; nsmHeader[28] = 'Telefono Firmatario';
  nsmHeader[38] = 'Descrizione'; nsmHeader[39] = 'Quantità'; nsmHeader[40] = 'Seriale';
  nsmHeader[43] = 'Prezzo mensile unitario'; nsmHeader[44] = 'Prezzo mensile servizi totale';
  const nsmRows: unknown[][] = [nsmHeader];

  for (let i = 0; i < AZIENDE_TEST.length; i++) {
    const az = AZIENDE_TEST[i]!;
    const num = String(i + 1).padStart(2, '0');
    const mesi = MESI_TEST[i]!;
    const grenkeId = `G-FLEX-TEST-${num}`;
    const nsmId = `${anno}05${String(10000000000 + i * 7919)}${num}`;
    const email = `g.ciardo+eol${num}@gmail.com`;
    const pec = `g.ciardo+eol${num}pec@gmail.com`;
    const origine = i % 4 === 3 ? 'IOL' : 'Smartcom';

    const scadenza = new Date(oggi);
    scadenza.setDate(scadenza.getDate() + GIORNI_SCADENZA[i]!);
    const stipula = new Date(scadenza);
    stipula.setMonth(stipula.getMonth() - mesi);

    // 1-2 dispositivi per contratto
    const dispositivi = [DEVICE_TEST[i % DEVICE_TEST.length]!];
    if (i % 5 === 0) dispositivi.push(DEVICE_TEST[(i + 2) % DEVICE_TEST.length]!);
    let canone = 0;

    for (let d = 0; d < dispositivi.length; d++) {
      const dev = dispositivi[d]!;
      canone += dev.prezzo + dev.servizi;
      const riga: unknown[] = new Array(50).fill(null);
      riga[0] = 'Smartcom';
      riga[4] = 'GRENKE';
      riga[5] = nsmId;
      riga[6] = grenkeId;
      riga[13] = mesi;
      riga[14] = az.nome;
      riga[16] = az.piva;
      riga[18] = `Via dei Test ${i + 1}`;
      riga[19] = az.citta;
      riga[20] = '10100';
      riga[21] = az.provincia;
      riga[22] = email;
      riga[23] = pec;
      riga[24] = `011${az.piva.slice(-7)}`;
      riga[26] = 'Referente';
      riga[27] = az.nome.split(' ')[0];
      riga[28] = `333${az.piva.slice(-7)}`;
      riga[38] = dev.descrizione;
      riga[39] = 1;
      riga[40] = `TEST-SN-${num}${d}`;
      riga[43] = dev.prezzo;
      riga[44] = dev.servizi;
      nsmRows.push(riga);
    }
    canone = round2(canone);

    // Solo i primi 15 entrano nel file Grenke (gli altri 2 → "scartati")
    if (i < 15) {
      const prezzoGrenkeTest = round2(canone * (mesi / 12) * 0.6);
      grenkeRows.push({
        'Numero Contratto Grenke': grenkeId,
        'Denominazione Sociale': az.nome,
        'P.IVA': az.piva,
        'Email': email,
        'PEC': pec,
        'Data Inizio Contratto': formatDateIt(stipula),
        'Data Fine Contratto': formatDateIt(scadenza),
        'Importo Riacquisto Grenke': prezzoGrenkeTest,
        'Origine': origine,
      });
    }
  }

  // Riga Grenke SENZA dati NSM (deve risultare eccezione "senza NSM")
  const scadenzaX = new Date(oggi);
  scadenzaX.setDate(scadenzaX.getDate() + 75);
  grenkeRows.push({
    'Numero Contratto Grenke': 'G-FLEX-TEST-99',
    'Denominazione Sociale': 'Zenith Mancante SRL',
    'P.IVA': '11111111199',
    'Email': 'g.ciardo+eol99@gmail.com',
    'PEC': '',
    'Data Inizio Contratto': formatDateIt(new Date(scadenzaX.getFullYear() - 3, scadenzaX.getMonth(), scadenzaX.getDate())),
    'Data Fine Contratto': formatDateIt(scadenzaX),
    'Importo Riacquisto Grenke': 120,
    'Origine': 'Smartcom',
  });

  // 3) Genera i due file in memoria
  const wsGrenke = XLSX.utils.json_to_sheet(grenkeRows);
  wsGrenke['!cols'] = [
    { wch: 26 }, { wch: 30 }, { wch: 14 }, { wch: 30 }, { wch: 28 },
    { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 12 },
  ];
  const wbGrenke = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbGrenke, wsGrenke, 'Contratti in scadenza');
  const bufGrenke = XLSX.write(wbGrenke, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const wsNsm = XLSX.utils.aoa_to_sheet(nsmRows);
  const wbNsm = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbNsm, wsNsm, 'Sheet 1');
  const bufNsm = XLSX.write(wbNsm, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const ts = `${anno}${String(oggi.getMonth() + 1).padStart(2, '0')}${String(oggi.getDate()).padStart(2, '0')}`;

  console.log(`[TestData] Reset completato: generati lista Grenke (16 righe) ed export NSM (17 contratti)`);

  return {
    files: [
      { filename: `lista_grenke_test_${ts}.xlsx`, base64: bufGrenke.toString('base64') },
      { filename: `contratti_nsm_test_${ts}.xlsx`, base64: bufNsm.toString('base64') },
    ],
    contratti_importabili: 15,
    record_eliminati: {
      otp: otp.count,
      task_escalation: task.count,
      richieste_contatto: richieste.count,
      pagamenti: pagamenti.count,
      decisioni: decisioni.count,
      comunicazioni: comunicazioni.count,
      audit: audit.count,
      contratti: contratti.count,
      clienti: clienti.count,
      counter: counter.count,
    },
  };
}
