import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '../../../config');

const pricingRules = JSON.parse(readFileSync(resolve(configDir, 'pricing_rules.json'), 'utf-8'));
const loyaltyProgram = JSON.parse(readFileSync(resolve(configDir, 'loyalty_program.json'), 'utf-8'));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PricingResult {
  monte_canoni: number;
  pricing_grenke: number;
  pricing_riacquisto: number;
  margine_lordo: number;
}

export function calcolaPricing(canone_mensile: number, numero_mesi: number): PricingResult {
  const monte_canoni = canone_mensile * numero_mesi;
  return {
    monte_canoni: round2(monte_canoni),
    pricing_grenke: round2(monte_canoni * pricingRules.pricing_grenke_percentuale),
    pricing_riacquisto: round2(monte_canoni * pricingRules.pricing_riacquisto_percentuale),
    margine_lordo: round2(monte_canoni * pricingRules.margine_lordo_percentuale),
  };
}

export function calcolaValoreGiftCard(margine_lordo: number): number {
  const tagli: number[] = loyaltyProgram.gift_card.tagli_standard_eur;
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
