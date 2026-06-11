import * as XLSX from 'xlsx';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { calcolaPricing, calcolaValoreGiftCard } from './pricing.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '../../../config');

const excelMapping = JSON.parse(readFileSync(resolve(configDir, 'excel_mapping.json'), 'utf-8'));
const mapping: Record<string, string> = excelMapping.formato_grenke_standard;
const campiObbligatori: string[] = excelMapping.campi_obbligatori;

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

// Tracciato Grenke concordato: 8 colonne. Canone, durata e dispositivi NON
// sono nel file: arrivano dall'export della piattaforma NSM (import NSM).
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

export type RowStatus = 'RICONCILIATO_AUTO' | 'OUTLIER_DA_GESTIRE' | 'ERRORE';

export interface PreviewRow {
  index: number;
  status: RowStatus;
  raw: ParsedRow;
  errors?: string[];
  matchedContractId?: string;
  matchedContractNsmId?: string;
  warnings?: string[];
  pricing?: {
    monte_canoni: number;
    pricing_grenke: number;
    pricing_riacquisto: number;
    margine_lordo: number;
    valore_gift_card: number;
  };
  suggestedMatches?: Array<{
    clienteId: string;
    ragioneSociale: string;
    piva: string;
  }>;
}

export interface PreviewResult {
  totalRows: number;
  riconciliatiAuto: number;
  outlier: number;
  errori: number;
  rows: PreviewRow[];
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

export async function parseAndReconcile(buffer: Buffer, prisma: PrismaClient): Promise<PreviewResult> {
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

  const existingContracts = await prisma.contratto_EOL.findMany({
    select: { id: true, contratto_grenke_id: true, contratto_nsm_id: true, canone_mensile: true, numero_mesi: true },
  });
  const grenkeIdMap = new Map(existingContracts.map(c => [
    c.contratto_grenke_id,
    { id: c.id, nsmId: c.contratto_nsm_id, canone: Number(c.canone_mensile), mesi: c.numero_mesi },
  ]));

  const allClienti = await prisma.cliente.findMany({
    select: { id: true, ragione_sociale: true, piva: true },
  });

  const rows: PreviewRow[] = [];
  let riconciliatiAuto = 0;
  let outlier = 0;
  let errori = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapRow(rawRows[i]!);

    const parseResult = rowSchema.safeParse(mapped);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      rows.push({ index: i, status: 'ERRORE', raw: mapped as ParsedRow, errors: errorMessages });
      errori++;
      continue;
    }

    const parsed = parseResult.data;
    const match = grenkeIdMap.get(parsed.contratto_grenke_id);

    // Canone e durata vengono SEMPRE dalla piattaforma NSM (il file Grenke
    // non li contiene). Senza match il pricing cliente non è calcolabile.
    const canoneMaster = match ? match.canone : 0;
    const mesiMaster = match ? match.mesi : 0;
    const pricing = await calcolaPricing(canoneMaster, mesiMaster, parsed.pricing_grenke);
    const valore_gift_card = await calcolaValoreGiftCard(pricing.margine_lordo);

    if (match) {
      rows.push({
        index: i,
        status: 'RICONCILIATO_AUTO',
        raw: parsed,
        matchedContractId: match.id,
        matchedContractNsmId: match.nsmId,
        pricing: { ...pricing, valore_gift_card },
      });
      riconciliatiAuto++;
    } else {
      const piva = parsed['cliente.piva'];
      const ragioneSociale = parsed['cliente.ragione_sociale'].toLowerCase();

      const suggested = allClienti
        .filter(c =>
          c.piva === piva ||
          c.ragione_sociale.toLowerCase().includes(ragioneSociale) ||
          ragioneSociale.includes(c.ragione_sociale.toLowerCase())
        )
        .slice(0, 5)
        .map(c => ({ clienteId: c.id, ragioneSociale: c.ragione_sociale, piva: c.piva }));

      rows.push({
        index: i,
        status: 'OUTLIER_DA_GESTIRE',
        raw: parsed,
        pricing: { ...pricing, valore_gift_card },
        suggestedMatches: suggested,
        warnings: ['Contratto non presente in piattaforma: canone e dispositivi mancanti — importare prima i contratti NSM'],
      });
      outlier++;
    }
  }

  return { totalRows: rawRows.length, riconciliatiAuto, outlier, errori, rows };
}
