/**
 * Riconoscimento dell'origine commerciale di una pratica.
 *
 * `origine` arriva dalla colonna "broker name" del file Grenke, quindi contiene
 * la dicitura che scrive Grenke: sui dati veri e' "Italiaonline S.p.A", non il
 * codice "IOL" usato nei dati di prova. Confrontare stringhe esatte renderebbe
 * il riconoscimento fragile — basterebbe "Italia Online SpA" per farlo fallire
 * in silenzio — quindi il confronto normalizza e cerca una sottostringa, e le
 * diciture sono configurabili dalle Impostazioni senza bisogno di un rilascio.
 */
export function normalizzaOrigine(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** True se la pratica proviene da uno dei broker elencati in `diciture`. */
export function origineCorrisponde(
  origine: string | null | undefined,
  diciture: string[],
): boolean {
  const o = normalizzaOrigine(origine);
  if (!o) return false;
  return diciture
    .map(normalizzaOrigine)
    .filter(Boolean)
    .some(d => o.includes(d));
}
