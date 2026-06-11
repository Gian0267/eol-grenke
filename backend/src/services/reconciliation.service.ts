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

// Tracciato Grenke concordato: 9 colonne. Canone, durata e dispositivi NON
// sono nel file: arrivano dall'export della piattaforma NSM.
const rowSchema = z.object({
  contratto_grenke_id: z.string().min(1, 'Numero Contratto Grenke obbligatorio'),
  'cliente.ragione_sociale': z.string().min(1, 'Denominazione Sociale obbligatoria'),
  'cliente.piva': z.string().regex(/^\d{11}$/, 'P.IVA deve essere di 11 cifre'),
  'cliente.email': z.string().email('Email non valida'),
  'cliente.pec': z.string().email('PEC non valida').optional().or(z.literal('')),
  data_stipula: flexDate.optional(),
  data_scadenza: flexDate,
  // Importo che Grenke addebita a Smartcom: obbligatorio.
  pricing_grenke: z.coerce
    .number({ error: 'Importo Riacquisto Grenke mancante o non numerico (colonna obbligatoria del file Grenke)' })
    .positive('Importo Riacquisto Grenke deve essere positivo'),
  // Origine commerciale del contratto (IOL / Smartcom) — ultima colonna
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

function mapRow(rawRow: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [excelCol, dbField] of Object.entries(mapping)) {
    if (rawRow[excelCol] !== undefined && rawRow[excelCol] !== null && rawRow[excelCol] !== '') {
      mapped[dbField as string] = rawRow[excelCol];
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
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

  if (rawRows.length === 0) {
    throw new Error('Il file Excel non contiene righe di dati');
  }

  const rows: GrenkeParsedRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapRow(rawRows[i]!);
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
