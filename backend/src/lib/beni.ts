/**
 * Formattazione dei beni di un contratto (da beni_json).
 * La quantità è sempre indicata quando > 1: "2× Samsung Galaxy S24 …".
 *
 * Riacquisto parziale: il backoffice può escludere singoli dispositivi dal
 * riacquisto (concessione riservata ai clienti maggiori). Gli esclusi sono
 * indici di beni_json salvati in beni_esclusi_json; il cliente li restituisce
 * con la procedura di reso ordinaria. Verso Grenke compriamo sempre tutto.
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

/** Indici dei beni esclusi dal riacquisto. Lista vuota = riacquisto totale. */
export function parseEsclusi(esclusiJson: string | null | undefined): number[] {
  if (!esclusiJson) return [];
  try {
    const parsed = JSON.parse(esclusiJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => Number.isInteger(n) && n >= 0);
  } catch {
    return [];
  }
}

/** True se al cliente è stato concesso di riscattare solo una parte dei beni. */
export function isRiacquistoParziale(esclusiJson: string | null | undefined): boolean {
  return parseEsclusi(esclusiJson).length > 0;
}

/** I beni che il cliente riscatta. Senza esclusioni sono tutti. */
export function beniInclusi(
  beniJson: string | null | undefined,
  esclusiJson: string | null | undefined,
): BeneJson[] {
  const esclusi = new Set(parseEsclusi(esclusiJson));
  return parseBeni(beniJson).filter((_, i) => !esclusi.has(i));
}

/** I beni che il cliente NON riscatta e deve restituire. */
export function beniEsclusi(
  beniJson: string | null | undefined,
  esclusiJson: string | null | undefined,
): BeneJson[] {
  const esclusi = new Set(parseEsclusi(esclusiJson));
  return parseBeni(beniJson).filter((_, i) => esclusi.has(i));
}

/** Elenco compatto dei soli beni riscattati. */
export function formatBeniInclusi(
  beniJson: string | null | undefined,
  esclusiJson: string | null | undefined,
  fallback = 'Beni come da contratto',
): string {
  const beni = beniInclusi(beniJson, esclusiJson);
  return beni.length > 0 ? beni.map(formatBene).join(', ') : fallback;
}
