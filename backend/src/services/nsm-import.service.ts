import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

/**
 * Parser e validazione dell'export della piattaforma di noleggio NSM.
 *
 * Usato dall'import combinato (combined-import.service.ts): il file NSM viene
 * caricato insieme al file Grenke e fornisce le informazioni che il file
 * Grenke non porta (dispositivi con seriali, firmatario, contatti, canone
 * reale per device, numero rate).
 *
 * Regole (concordate con NSM):
 * - vale solo per le righe con Finanziaria = GRENKE (col. E)
 * - una riga per dispositivo: stesso contratto → più righe (col. F identica)
 * - canone mensile per dispositivo = (AR + AS) × quantità (AN) — la colonna
 *   AT (accessori) NON si conta
 * - canone mensile del contratto = somma dei canoni dei dispositivi
 * - il canone del file NSM è il dato MASTER (quello del file Grenke si ignora)
 * - la data di scadenza NON è in questo file: arriva dal file Grenke
 * - REGOLA 1:1 — a ogni contratto NSM corrisponde UN solo contratto Grenke:
 *   se un numero NSM compare su più contratti Grenke il file è errato e i
 *   gruppi coinvolti finiscono in errore
 */

// Indici colonna (0-based) del tracciato export NSM
const COL = {
  finanziaria: 4,        // E
  contratto_nsm: 5,      // F
  contratto_grenke: 6,   // G
  data_accettazione: 9,  // J
  numero_rate: 13,       // N
  ragione_sociale: 14,   // O
  piva: 16,              // Q
  codice_fiscale: 17,    // R
  indirizzo: 18,         // S
  citta: 19,             // T
  cap: 20,               // U
  provincia: 21,         // V
  email: 22,             // W
  pec: 23,               // X
  telefono: 24,          // Y
  firmatario_nome: 26,   // AA
  firmatario_cognome: 27,// AB
  firmatario_telefono: 28, // AC
  descrizione: 38,       // AM
  quantita: 39,          // AN
  seriale: 40,           // AO
  prezzo_unitario: 43,   // AR
  prezzo_servizi: 44,    // AS
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(String(v).replace(',', '.'));
  return n;
}

export interface DispositivoNsm {
  descrizione: string;
  quantita: number;
  seriale?: string;
  canone_unitario: number;
}

export interface NsmContractPreview {
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  ragione_sociale: string;
  piva: string;
  email: string;
  pec: string | null;
  numero_mesi: number;
  canone_mensile: number;
  dispositivi: DispositivoNsm[];
  azione: 'CREA' | 'AGGIORNA';
  errors: string[];
}

export interface NsmImportPreview {
  totalRows: number;
  righe_non_grenke: number;
  contratti: NsmContractPreview[];
  validi: number;
  errori: number;
}

export function parseNsmExport(buffer: Buffer): {
  totalRows: number;
  righe_non_grenke: number;
  gruppi: Map<string, Record<string, unknown>[]>;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Il file Excel non contiene fogli');
  const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
    header: 1,
    defval: null,
  });

  // Salta intestazione; raggruppa per numero contratto GRENKE (col. G),
  // l'unità di gestione EOL. La corrispondenza NSM↔Grenke è 1:1: la
  // violazione viene segnalata come errore in fase di anteprima.
  const gruppi = new Map<string, Record<string, unknown>[]>();
  let righeNonGrenke = 0;
  let totalRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    // riga completamente vuota → skip
    if (row.every((c) => c === null || str(c) === '')) continue;
    totalRows++;

    const finanziaria = str(row[COL.finanziaria]).toUpperCase();
    if (finanziaria !== 'GRENKE') {
      righeNonGrenke++;
      continue;
    }

    const nsmId = str(row[COL.contratto_nsm]);
    const grenkeIdRiga = str(row[COL.contratto_grenke]);
    const key = grenkeIdRiga || `__RIGA_${i}`;
    if (!gruppi.has(key)) gruppi.set(key, []);
    gruppi.get(key)!.push({
      _rowIndex: i + 1,
      finanziaria,
      contratto_nsm: nsmId,
      contratto_grenke: str(row[COL.contratto_grenke]),
      numero_rate: num(row[COL.numero_rate]),
      ragione_sociale: str(row[COL.ragione_sociale]),
      piva: str(row[COL.piva]),
      codice_fiscale: str(row[COL.codice_fiscale]),
      indirizzo: str(row[COL.indirizzo]),
      citta: str(row[COL.citta]),
      cap: str(row[COL.cap]),
      provincia: str(row[COL.provincia]),
      email: str(row[COL.email]),
      pec: str(row[COL.pec]),
      telefono: str(row[COL.telefono]),
      firmatario_nome: str(row[COL.firmatario_nome]),
      firmatario_cognome: str(row[COL.firmatario_cognome]),
      firmatario_telefono: str(row[COL.firmatario_telefono]),
      descrizione: str(row[COL.descrizione]),
      quantita: num(row[COL.quantita]),
      seriale: str(row[COL.seriale]),
      prezzo_unitario: num(row[COL.prezzo_unitario]),
      prezzo_servizi: num(row[COL.prezzo_servizi]),
    });
  }

  return { totalRows, righe_non_grenke: righeNonGrenke, gruppi };
}

export async function previewNsmImport(buffer: Buffer, prisma: PrismaClient): Promise<NsmImportPreview> {
  const { totalRows, righe_non_grenke, gruppi } = parseNsmExport(buffer);

  const contratti: NsmContractPreview[] = [];

  // Regola 1:1 — mappa numero NSM → contratti Grenke in cui compare
  const nsmToGrenke = new Map<string, Set<string>>();
  for (const [grenkeKey, righe] of gruppi.entries()) {
    for (const r of righe) {
      const n = str(r.contratto_nsm);
      if (!n) continue;
      if (!nsmToGrenke.has(n)) nsmToGrenke.set(n, new Set());
      nsmToGrenke.get(n)!.add(grenkeKey);
    }
  }

  for (const [grenkeKey, righe] of gruppi.entries()) {
    const prima = righe[0]!;
    const errors: string[] = [];

    const grenkeId = grenkeKey.startsWith('__RIGA_') ? '' : grenkeKey;
    if (!grenkeId) errors.push('Numero contratto Grenke (col. G) mancante');
    const nsmId = str(prima.contratto_nsm);
    if (!nsmId) errors.push('Numero contratto NSM (col. F) mancante');
    if (nsmId && (nsmToGrenke.get(nsmId)?.size ?? 0) > 1) {
      const altri = [...nsmToGrenke.get(nsmId)!].join(', ');
      errors.push(`Il contratto NSM ${nsmId} compare su più contratti Grenke (${altri}): la corrispondenza deve essere 1:1 — verificare il file`);
    }
    const mesi = Number(prima.numero_rate);
    if (!Number.isInteger(mesi) || mesi <= 0) errors.push('Numero rate (col. N) mancante o non valido');
    const ragioneSociale = str(prima.ragione_sociale);
    if (!ragioneSociale) errors.push('Ragione sociale (col. O) mancante');
    const piva = str(prima.piva);
    if (!/^\d{11}$/.test(piva)) errors.push('P.IVA (col. Q) mancante o non valida (11 cifre)');
    const email = str(prima.email);
    if (!email.includes('@')) errors.push('Email (col. W) mancante o non valida');

    // coerenza tra le righe dello stesso contratto Grenke
    for (const r of righe) {
      if (str(r.contratto_nsm) !== nsmId) errors.push(`Riga ${r._rowIndex}: numero contratto NSM diverso dalle altre righe`);
      if (str(r.piva) !== piva) errors.push(`Riga ${r._rowIndex}: P.IVA diversa dalle altre righe`);
    }

    // dispositivi e canone
    const dispositivi: DispositivoNsm[] = [];
    let canone = 0;
    for (const r of righe) {
      const qta = Number(r.quantita);
      const unit = Number(r.prezzo_unitario);
      const servizi = Number(r.prezzo_servizi);
      if (!Number.isFinite(qta) || qta <= 0) {
        errors.push(`Riga ${r._rowIndex}: quantità (col. AN) mancante o non valida`);
        continue;
      }
      if (!Number.isFinite(unit)) {
        errors.push(`Riga ${r._rowIndex}: prezzo mensile unitario (col. AR) mancante o non valido`);
        continue;
      }
      const canoneUnitario = round2(unit + (Number.isFinite(servizi) ? servizi : 0));
      canone += canoneUnitario * qta;
      dispositivi.push({
        descrizione: str(r.descrizione) || 'N/D',
        quantita: qta,
        seriale: str(r.seriale) || undefined,
        canone_unitario: canoneUnitario,
      });
    }
    canone = round2(canone);
    if (canone <= 0 && errors.length === 0) errors.push('Canone mensile calcolato nullo');

    // esiste già? (per numero NSM, poi per numero Grenke)
    let azione: 'CREA' | 'AGGIORNA' = 'CREA';
    if (errors.length === 0) {
      const esistente = await prisma.contratto_EOL.findFirst({
        where: { contratto_grenke_id: grenkeId },
        select: { id: true },
      });
      if (esistente) azione = 'AGGIORNA';
    }

    contratti.push({
      contratto_nsm_id: nsmId,
      contratto_grenke_id: grenkeId,
      ragione_sociale: ragioneSociale,
      piva,
      email,
      pec: str(prima.pec) || null,
      numero_mesi: mesi,
      canone_mensile: canone,
      dispositivi,
      azione,
      errors,
    });
  }

  return {
    totalRows,
    righe_non_grenke,
    contratti,
    validi: contratti.filter((c) => c.errors.length === 0).length,
    errori: contratti.filter((c) => c.errors.length > 0).length,
  };
}
