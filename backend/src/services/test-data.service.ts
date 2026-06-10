import { prisma } from '../lib/db.js';
import { calcolaPricing, calcolaValoreGiftCard } from './pricing.service.js';

/**
 * SOLO PER LA FASE DI TEST — da rimuovere prima della produzione effettiva.
 *
 * Svuota tutti i dati operativi (pratiche, decisioni, pagamenti, comunicazioni,
 * audit, OTP, escalation, clienti) e ricrea 15 pratiche "vergini" in stato
 * LISTA_RICEVUTA con scadenze distribuite sulle fasce della timeline, così da
 * poter testare solleciti, escalation T-50/T-40/T-35 e i flussi di decisione.
 *
 * NON tocca: Utente_NSM (utenti e password) e Impostazione (configurazione).
 *
 * Le email dei clienti di test usano il pattern g.ciardo+eolNN@gmail.com:
 * Gmail le recapita tutte nella casella g.ciardo@gmail.com, quindi le
 * comunicazioni inviate durante i test arrivano davvero e sono verificabili.
 * La PEC è lasciata vuota per non generare invii PEC verso indirizzi finti.
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
];

// Giorni alla scadenza: coprono le fasce escalation (31-50), i solleciti e le fasi iniziali
const GIORNI_SCADENZA = [32, 34, 38, 42, 47, 55, 62, 70, 80, 92, 105, 120, 135, 150, 165];

const BENI_TEST = [
  [{ descrizione: 'iPhone 15 Pro 256GB', marca: 'Apple', modello: 'iPhone 15 Pro', seriale: 'TEST-IP15-' }],
  [{ descrizione: 'MacBook Air M3 13"', marca: 'Apple', modello: 'MacBook Air M3', seriale: 'TEST-MBA-' }],
  [{ descrizione: 'iPad Pro 11" M4', marca: 'Apple', modello: 'iPad Pro 11', seriale: 'TEST-IPP-' }],
  [
    { descrizione: 'iPhone 15 128GB', marca: 'Apple', modello: 'iPhone 15', seriale: 'TEST-IP15B-' },
    { descrizione: 'MacBook Pro 14" M3', marca: 'Apple', modello: 'MacBook Pro 14', seriale: 'TEST-MBP-' },
  ],
];

const CANONI_TEST = [89, 120, 150, 185, 220, 260, 310, 95, 140, 175, 205, 245, 280, 110, 160];
const MESI_TEST = [24, 36, 48, 24, 36, 48, 36, 24, 48, 36, 24, 36, 48, 36, 24];

export interface ResetTestDataResult {
  pratiche_create: number;
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

  // 2) Ricrea 15 pratiche vergini
  const oggi = new Date();
  const anno = oggi.getFullYear();

  for (let i = 0; i < AZIENDE_TEST.length; i++) {
    const az = AZIENDE_TEST[i]!;
    const num = String(i + 1).padStart(2, '0');
    const canone = CANONI_TEST[i]!;
    const mesi = MESI_TEST[i]!;

    const scadenza = new Date(oggi);
    scadenza.setDate(scadenza.getDate() + GIORNI_SCADENZA[i]!);
    const stipula = new Date(scadenza);
    stipula.setMonth(stipula.getMonth() - mesi);

    const pricing = await calcolaPricing(canone, mesi);
    const giftCard = await calcolaValoreGiftCard(pricing.margine_lordo);

    const beni = BENI_TEST[i % BENI_TEST.length]!.map((b, j) => ({
      ...b,
      seriale: `${b.seriale}${num}${j}`,
    }));

    const cliente = await prisma.cliente.create({
      data: {
        ragione_sociale: az.nome,
        piva: az.piva,
        email: `g.ciardo+eol${num}@gmail.com`,
        pec: null,
        telefono: `011${az.piva.slice(-7)}`,
        referente_nome: `Referente ${az.nome.split(' ')[0]}`,
        indirizzo_sede: `Via dei Test ${i + 1}`,
        cap: '10100',
        citta: az.citta,
        provincia: az.provincia,
      },
    });

    await prisma.contratto_EOL.create({
      data: {
        contratto_nsm_id: `NSM-TEST-${anno}-${num}`,
        contratto_grenke_id: `G-FLEX-TEST-${num}`,
        cliente_id: cliente.id,
        data_stipula: stipula,
        data_scadenza: scadenza,
        canone_mensile: canone,
        numero_mesi: mesi,
        monte_canoni: pricing.monte_canoni,
        beni_json: JSON.stringify(beni),
        pricing_riacquisto: pricing.pricing_riacquisto,
        pricing_grenke: pricing.pricing_grenke,
        margine_lordo: pricing.margine_lordo,
        valore_gift_card: giftCard,
        stato: 'LISTA_RICEVUTA',
        origine: 'Smartcom',
        data_importazione: oggi,
        stato_riconciliazione: 'RICONCILIATO_AUTO',
      },
    });
  }

  console.log(`[TestData] Reset completato: 15 pratiche di test ricreate`);

  return {
    pratiche_create: AZIENDE_TEST.length,
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
