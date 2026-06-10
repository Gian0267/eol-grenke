import * as configService from './config.service.js';

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
 * Calcola i valori economici della pratica.
 *
 * - pricing_grenke: importo che Grenke addebita a Smartcom — NON è calcolato,
 *   arriva dal file Excel di Grenke (colonna "Prezzo Riacquisto Grenke").
 * - pricing_riacquisto (prezzo al cliente): un canone mensile per ogni anno
 *   di contratto → canone_mensile × (numero_mesi / 12).
 *   Es. 36 mesi a € 120/mese → € 360.
 * - margine_lordo: differenza tra prezzo al cliente e addebito Grenke.
 */
export async function calcolaPricing(
  canone_mensile: number,
  numero_mesi: number,
  pricing_grenke: number,
): Promise<PricingResult> {
  const monte_canoni = canone_mensile * numero_mesi;
  const pricing_riacquisto = canone_mensile * (numero_mesi / 12);
  return {
    monte_canoni: round2(monte_canoni),
    pricing_grenke: round2(pricing_grenke),
    pricing_riacquisto: round2(pricing_riacquisto),
    margine_lordo: round2(pricing_riacquisto - pricing_grenke),
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
