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

export async function calcolaPricing(canone_mensile: number, numero_mesi: number): Promise<PricingResult> {
  const grenkePerc = (await configService.getNumero('pricing.grenke_percentuale', 5)) / 100;
  const riacquistoPerc = (await configService.getNumero('pricing.riacquisto_percentuale', 8)) / 100;
  const monte_canoni = canone_mensile * numero_mesi;
  const pricing_grenke = monte_canoni * grenkePerc;
  const pricing_riacquisto = monte_canoni * riacquistoPerc;
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
