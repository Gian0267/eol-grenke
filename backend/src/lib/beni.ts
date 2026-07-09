/**
 * Formattazione dei beni di un contratto (da beni_json).
 * La quantità è sempre indicata quando > 1: "2× Samsung Galaxy S24 …".
 */
export interface BeneJson {
  descrizione?: string;
  quantita?: number;
  seriale?: string;
  marca?: string;
  modello?: string;
}

export function parseBeni(beniJson: string | null | undefined): BeneJson[] {
  if (!beniJson) return [];
  try {
    const parsed = JSON.parse(beniJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** "2× Samsung Galaxy S24" oppure "Samsung Galaxy S24" se quantità 1/assente. */
export function formatBene(b: BeneJson): string {
  const desc = b.descrizione || 'N/D';
  const qta = Number(b.quantita);
  return Number.isFinite(qta) && qta > 1 ? `${qta}× ${desc}` : desc;
}

/** Elenco compatto per email/template: "2× Galaxy S24, iPad Air". */
export function formatBeniLista(beniJson: string | null | undefined, fallback = 'Beni come da contratto'): string {
  const beni = parseBeni(beniJson);
  return beni.length > 0 ? beni.map(formatBene).join(', ') : fallback;
}
