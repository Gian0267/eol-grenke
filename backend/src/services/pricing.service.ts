import * as configService from './config.service.js';
import { origineCorrisponde } from '../lib/origine.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PricingResult {
  monte_canoni: number;
  pricing_grenke: number;
  pricing_riacquisto: number;
  margine_lordo: number;
}

/**
 * Quante mensilita' si chiedono al cliente per ogni anno di locazione.
 *
 * E' la leva commerciale del riacquisto: il prezzo non deriva dal costo Grenke
 * ma dal canone, e questo numero decide quanto ci si guadagna. Vale 1 per la
 * generalita' dei contratti e un valore diverso per i clienti Italiaonline,
 * riconosciuti dalla stessa lista di diciture usata dalle comunicazioni
 * (`iol.diciture_origine`), perche' il "broker name" del file Grenke non e'
 * una stringa stabile.
 */
export async function mensilitaPerAnno(origine?: string | null): Promise<number> {
  const standard = await configService.getNumero('pricing.mensilita_per_anno', 1);
  if (!origine) return standard;

  const diciture = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
    .split('\n').map(s => s.trim()).filter(Boolean);

  return origineCorrisponde(origine, diciture)
    ? await configService.getNumero('pricing.mensilita_per_anno_iol', 1.5)
    : standard;
}

/**
 * Calcola i valori economici della pratica.
 *
 * - pricing_grenke: importo che Grenke addebita a Integra Systems — NON è
 *   calcolato, arriva dal file Excel di Grenke (colonna "Prezzo Riacquisto
 *   Grenke").
 * - pricing_riacquisto (prezzo al cliente): un numero configurabile di
 *   mensilita' per ogni anno di contratto → canone × (mesi / 12) × mensilita'.
 *   Es. 24 mesi a € 100/mese con 1,5 mensilita' → € 300.
 * - margine_lordo: differenza tra prezzo al cliente e addebito Grenke. Non e'
 *   un parametro: e' cio' che resta, e puo' andare sotto zero sui riacquisti
 *   parziali concessi dal backoffice.
 */
export async function calcolaPricing(
  canone_mensile: number,
  numero_mesi: number,
  pricing_grenke: number,
  origine?: string | null,
): Promise<PricingResult> {
  const monte_canoni = canone_mensile * numero_mesi;
  const mensilita = await mensilitaPerAnno(origine);
  const pricing_riacquisto = canone_mensile * (numero_mesi / 12) * mensilita;
  return {
    monte_canoni: round2(monte_canoni),
    pricing_grenke: round2(pricing_grenke),
    pricing_riacquisto: round2(pricing_riacquisto),
    margine_lordo: round2(round2(pricing_riacquisto) - round2(pricing_grenke)),
  };
}

export async function calcolaValoreGiftCard(margine_lordo: number): Promise<number> {
  const tagli = await configService.getJson<number[]>('pricing.gift_card_tagli', [25, 50, 75, 100, 125, 150, 200, 250, 300]);
  let valore = 0;
  for (const taglio of tagli) {
    if (taglio <= margine_lordo) {
      valore = taglio;
    } else {
      break;
    }
  }
  return valore;
}

/* ------------------------------------------------------------------ */
/*  Sconto sul riscatto per chi attiva un nuovo noleggio               */
/* ------------------------------------------------------------------ */

/**
 * Entro quando il nuovo contratto deve essere approvato e firmato perche' lo
 * sconto valga. Il nome del campo dice ancora "spedito": e' rimasto invariato
 * per non riscrivere colonna, API e storico a ogni cambio di regola.
 *
 * E' l'ultimo giorno del mese che si chiude almeno `giorniMinimi` giorni prima
 * della scadenza: si parte dal mese precedente e si arretra finche' il margine
 * basta. Per un contratto in scadenza il 01/01/2027 da' il 30/11/2026, non il
 * 31/12 — che sarebbe un giorno prima della scadenza e non servirebbe a nulla.
 *
 * Conseguenza utile: la data limite cade sempre ad almeno `giorniMinimi` giorni
 * dalla scadenza, quindi sempre PRIMA della richiesta di pagamento (T-26).
 * Quando il cliente paga, sappiamo gia' se lo sconto gli spetta.
 */
export function dataLimiteSconto(scadenza: Date, giorniMinimi = 30): Date {
  const sc = new Date(Date.UTC(scadenza.getUTCFullYear(), scadenza.getUTCMonth(), scadenza.getUTCDate()));
  let mese = sc.getUTCMonth();
  for (let i = 0; i < 24; i++) {
    // Giorno 0 del mese = ultimo giorno del mese precedente.
    const fineMese = new Date(Date.UTC(sc.getUTCFullYear(), mese - i, 0));
    if ((sc.getTime() - fineMese.getTime()) / 86400000 >= giorniMinimi) return fineMese;
  }
  // Non raggiungibile con date sensate, ma meglio un valore che un ciclo aperto.
  return new Date(sc.getTime() - giorniMinimi * 86400000);
}

export interface PrezzoRiacquisto {
  listino: number;
  sconto_percentuale: number;
  sconto_euro: number;
  netto: number;
  /** Lo sconto e' stato ridotto per non scendere sotto il costo Grenke. */
  limitato_dal_costo: boolean;
  data_limite: Date | null;
  /** Il prezzo e' stato concordato a mano: lo sconto non si applica. */
  prezzo_concordato: boolean;
}

type ContrattoPerPrezzo = {
  pricing_riacquisto: unknown;
  pricing_grenke: unknown;
  pricing_riacquisto_pieno?: unknown;
  beni_esclusi_json?: string | null;
  data_scadenza?: Date | null;
  nuovo_noleggio_spedito_il?: Date | null;
  sconto_riscatto_percentuale?: unknown;
};

/**
 * Quanto paga davvero il cliente per il riscatto.
 *
 * UNICO punto che decide il prezzo: prima la stessa matematica era ripetuta in
 * tre posti indipendenti (payment.service, cliente.routes, scheduler.service),
 * e con lo sconto sarebbero diventate tre occasioni di divergere. Un cliente
 * che vede un importo nell'area riservata e un altro nella mail di pagamento
 * non perdona.
 *
 * Lo sconto spetta solo se il backoffice ha confermato la firma del nuovo
 * noleggio entro la data limite. Non si applica ai prezzi concordati a mano
 * (riacquisto parziale o prezzo su misura), che sono gia' frutto di una
 * trattativa, e non porta mai il prezzo sotto quello che paghiamo a Grenke.
 */
export async function prezzoRiacquisto(c: ContrattoPerPrezzo): Promise<PrezzoRiacquisto> {
  const listino = round2(Number(c.pricing_riacquisto));
  const costoGrenke = round2(Number(c.pricing_grenke));
  const prezzoConcordato = Boolean(c.beni_esclusi_json) || c.pricing_riacquisto_pieno != null;
  const dataLimite = c.data_scadenza
    ? dataLimiteSconto(new Date(c.data_scadenza), await configService.getNumero('sconto_nuovo_noleggio.giorni_minimi', 30))
    : null;

  const nessunoSconto: PrezzoRiacquisto = {
    listino,
    sconto_percentuale: 0,
    sconto_euro: 0,
    netto: listino,
    limitato_dal_costo: false,
    data_limite: dataLimite,
    prezzo_concordato: prezzoConcordato,
  };

  if (!await configService.getBooleano('flags.abilita_sconto_nuovo_noleggio', true)) return nessunoSconto;
  if (prezzoConcordato) return nessunoSconto;
  if (!c.nuovo_noleggio_spedito_il || !dataLimite) return nessunoSconto;

  const spedito = new Date(c.nuovo_noleggio_spedito_il);
  spedito.setUTCHours(0, 0, 0, 0);
  if (spedito.getTime() > dataLimite.getTime()) return nessunoSconto;

  // La percentuale congelata alla concessione vince su quella corrente.
  const perc = c.sconto_riscatto_percentuale != null
    ? Number(c.sconto_riscatto_percentuale)
    : await configService.getNumero('sconto_nuovo_noleggio.percentuale', 15);
  if (!(perc > 0)) return nessunoSconto;

  const nettoPieno = round2(listino * (1 - perc / 100));
  const netto = Math.max(nettoPieno, costoGrenke);

  return {
    listino,
    sconto_percentuale: listino > 0 ? round2(((listino - netto) / listino) * 100) : 0,
    sconto_euro: round2(listino - netto),
    netto: round2(netto),
    limitato_dal_costo: netto > nettoPieno,
    data_limite: dataLimite,
    prezzo_concordato: false,
  };
}

export interface ImportiRiacquisto extends PrezzoRiacquisto {
  importo_netto: number;
  importo_iva: number;
  importo_totale: number;
}

/**
 * Netto, IVA e totale del riscatto, sconto compreso.
 *
 * Questa e' la funzione che devono chiamare TUTTI: pagamento, area cliente,
 * mail di invito. Prima ognuno rifaceva la stessa moltiplicazione per conto
 * suo, con l'IVA ordinaria al 22% ripetuta in tre file.
 */
export async function importiRiacquisto(c: ContrattoPerPrezzo): Promise<ImportiRiacquisto> {
  const prezzo = await prezzoRiacquisto(c);
  const ivaPerc = await configService.getNumero('pricing.iva_percentuale', 22) / 100;
  const centNetto = Math.round(prezzo.netto * 100);
  const centIva = Math.round(centNetto * ivaPerc);
  return {
    ...prezzo,
    importo_netto: centNetto / 100,
    importo_iva: centIva / 100,
    importo_totale: (centNetto + centIva) / 100,
  };
}
