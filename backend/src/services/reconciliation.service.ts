import * as XLSX from 'xlsx';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '../../../config');

const excelMapping = JSON.parse(readFileSync(resolve(configDir, 'excel_mapping.json'), 'utf-8'));
const mapping: Record<string, string> = excelMapping.formato_grenke_standard;

function parseDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // DD/MM/YYYY format
    const ddmmyyyy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    }
    // YYYY-MM-DD or ISO
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  throw new Error(`Data non valida: ${v}`);
}

const flexDate = z.union([z.date(), z.string(), z.number()]).transform(parseDate);

/**
 * Importo in formato italiano o numerico: gestisce "2.803,51 €", "2803.51",
 * numeri Excel e spazi. Il NAV del template Grenke arriva formattato valuta.
 */
function parseImporto(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    let t = v.replace(/[€\s]/g, '');
    const lastDot = t.lastIndexOf('.');
    const lastComma = t.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
      // Entrambi i separatori: quello più a destra è il decimale
      // ("2.803,51" italiano / "2,803.51" inglese)
      t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (lastComma !== -1) {
      // Solo virgole: decimale se seguita da 1-2 cifre finali, altrimenti migliaia
      t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    } else if (lastDot !== -1 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
      // Solo punti in gruppi di tre: migliaia all'italiana ("2.803")
      t = t.replace(/\./g, '');
    }
    const n = Number(t);
    if (!isNaN(n)) return n;
  }
  throw new Error(`Importo non valido: ${v}`);
}

const flexImporto = z.union([z.number(), z.string()]).transform(parseImporto);

/** P.IVA: rimuove spazi e reintegra gli zeri iniziali persi dalle celle numeriche. */
function normalizzaPiva(v: unknown): string {
  const t = String(v ?? '').replace(/\s/g, '');
  return /^\d{9,10}$/.test(t) ? t.padStart(11, '0') : t;
}

// Template ufficiale Grenke (9 colonne, intestazioni inglesi). Canone, durata
// e dispositivi NON sono nel file: arrivano dall'export della piattaforma NSM.
const rowSchema = z.object({
  contratto_grenke_id: z.coerce.string().min(1, 'Numero di contratto (colonna "contract") obbligatorio'),
  'cliente.ragione_sociale': z.string().min(1, 'Nome cliente (colonna "lessee name") obbligatorio'),
  'cliente.piva': z.preprocess(normalizzaPiva, z.string().regex(/^\d{11}$/, 'P.IVA (colonna "lessee vat ID") deve essere di 11 cifre')),
  'cliente.email': z.string().email('Email (colonna "lessee email") non valida'),
  'cliente.pec': z.string().email('PEC non valida').optional().or(z.literal('')),
  data_stipula: flexDate.optional(),
  data_scadenza: flexDate,
  // NAV = importo TOTALE del contratto: il prezzo riacquisto Grenke si ricava
  // moltiplicandolo per pricing.grenke_percentuale (default 5%) in fase di import.
  nav: flexImporto.pipe(z.number().positive('NAV deve essere positivo')),
  // Origine commerciale del contratto — colonna "broker name"
  origine: z.string().optional(),
});

export type ParsedRow = z.infer<typeof rowSchema>;

export interface GrenkeParsedRow {
  index: number;
  ok: boolean;
  row?: ParsedRow;
  raw: Record<string, unknown>;
  errors?: string[];
}

/**
 * Il numero di contratto Grenke è spezzato su due colonne: la prima colonna
 * del file (senza intestazione, letta da SheetJS come "__EMPTY") contiene il
 * codice filiale e "contract" il progressivo. Il numero completo — quello che
 * la piattaforma NSM registra come "Internet Number" — è `259-17810`, quindi
 * senza il prefisso il match con l'export NSM fallisce sempre.
 */
function prefissoFiliale(rawRow: Record<string, unknown>): string | null {
  for (const [col, valore] of Object.entries(rawRow)) {
    if (!/^__EMPTY/.test(col)) continue;
    const t = String(valore ?? '').trim();
    if (/^\d{1,5}$/.test(t)) return t;
  }
  return null;
}

const normalizzaHeader = (h: string) => h.trim().replace(/\s+/g, ' ').toLowerCase();
const mappingNormalizzato = new Map(Object.entries(mapping).map(([k, v]) => [normalizzaHeader(k), v]));

function mapRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [col, valore] of Object.entries(rawRow)) {
    const dbField = mappingNormalizzato.get(normalizzaHeader(col));
    if (dbField && valore !== undefined && valore !== null && valore !== '') {
      mapped[dbField] = valore;
    }
  }
  return mapped;
}

/**
 * Parsa e valida il file Grenke (senza alcun match col database: la
 * correlazione con i contratti avviene contro il file NSM caricato insieme —
 * vedi combined-import.service.ts).
 */
export function parseGrenkeFile(buffer: Buffer): { totalRows: number; rows: GrenkeParsedRow[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Il file Excel non contiene fogli');
  }
  const sheet = workbook.Sheets[sheetName]!;
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: true });

  if (rawRows.length === 0) {
    throw new Error('Il file Excel non contiene righe di dati');
  }

  const rows: GrenkeParsedRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapRow(rawRows[i]!);
    const prefisso = prefissoFiliale(rawRows[i]!);
    if (prefisso && mapped.contratto_grenke_id !== undefined) {
      mapped.contratto_grenke_id = `${prefisso}-${String(mapped.contratto_grenke_id).trim()}`;
    }
    const parseResult = rowSchema.safeParse(mapped);
    if (!parseResult.success) {
      rows.push({
        index: i,
        ok: false,
        raw: mapped,
        errors: parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
      });
    } else {
      rows.push({ index: i, ok: true, raw: mapped, row: parseResult.data });
    }
  }

  return { totalRows: rawRows.length, rows };
}
