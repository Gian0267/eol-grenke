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
 * - pricing_grenke: importo che Grenke addebita a Integra Solutions — NON è
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
