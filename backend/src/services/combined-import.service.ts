import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { parseGrenkeFile, ParsedRow } from './reconciliation.service.js';
import { previewNsmImport, parseNsmExport, NsmContractPreview } from './nsm-import.service.js';
import { calcolaPricing, calcolaValoreGiftCard } from './pricing.service.js';

/**
 * Import combinato: file Grenke + export piattaforma NSM in un'unica
 * procedura guidata.
 *
 * Workflow (concordato con NSM):
 *  1. l'operatore carica il file Grenke (9 colonne: contratto, denominazione,
 *     P.IVA, email, PEC, date, importo Grenke, origine)
 *  2. il programma chiede il file NSM (export piattaforma di noleggio)
 *  3. match per numero contratto Grenke:
 *     - record NSM non presenti nel file Grenke → SCARTATI (conteggiati)
 *     - righe Grenke senza dati NSM → eccezione (canone/dispositivi mancanti)
 *     - righe Grenke già presenti come pratica → saltate
 *  4. conferma → pratiche create complete: numero NSM reale, dispositivi,
 *     canone e durata dal file NSM; scadenza, importo Grenke e origine dal
 *     file Grenke. Prezzo cliente = canone × anni di contratto.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_OFFSET_DAYS = Number(process.env.JWT_EXPIRES_OFFSET_DAYS || 30);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CombinedRowStatus = 'PRONTO' | 'SENZA_NSM' | 'GIA_PRESENTE' | 'ERRORE';

export interface CombinedRow {
  index: number;
  status: CombinedRowStatus;
  contratto_grenke_id: string;
  contratto_nsm_id?: string;
  denominazione: string;
  origine?: string;
  data_scadenza?: string;
  pricing_grenke?: number;
  canone_mensile?: number;
  numero_mesi?: number;
  dispositivi?: NsmContractPreview['dispositivi'];
  pricing?: {
    monte_canoni: number;
    pricing_grenke: number;
    pricing_riacquisto: number;
    margine_lordo: number;
    valore_gift_card: number;
  };
  errors?: string[];
}

export interface CombinedPreview {
  grenke_righe: number;
  nsm_contratti: number;
  nsm_scartati: number;
  pronti: number;
  senza_nsm: number;
  gia_presenti: number;
  errori: number;
  rows: CombinedRow[];
}

export async function previewCombinedImport(
  grenkeBuffer: Buffer,
  nsmBuffer: Buffer,
  prisma: PrismaClient,
): Promise<CombinedPreview> {
  const grenke = parseGrenkeFile(grenkeBuffer);
  const nsm = await previewNsmImport(nsmBuffer, prisma);

  const nsmByGrenke = new Map<string, NsmContractPreview>();
  for (const c of nsm.contratti) {
    nsmByGrenke.set(c.contratto_grenke_id, c);
  }

  // Pratiche già presenti (qualsiasi stato): si salta
  const esistenti = await prisma.contratto_EOL.findMany({ select: { contratto_grenke_id: true } });
  const grenkeEsistenti = new Set(esistenti.map((c) => c.contratto_grenke_id));

  const rows: CombinedRow[] = [];

  for (const g of grenke.rows) {
    if (!g.ok || !g.row) {
      rows.push({
        index: g.index,
        status: 'ERRORE',
        contratto_grenke_id: String(g.raw.contratto_grenke_id ?? '—'),
        denominazione: String(g.raw['cliente.ragione_sociale'] ?? '—'),
        errors: g.errors,
      });
      continue;
    }

    const r = g.row;
    const base = {
      index: g.index,
      contratto_grenke_id: r.contratto_grenke_id,
      denominazione: r['cliente.ragione_sociale'],
      origine: r.origine,
      data_scadenza: r.data_scadenza.toISOString(),
      pricing_grenke: r.pricing_grenke,
    };

    if (grenkeEsistenti.has(r.contratto_grenke_id)) {
      rows.push({
        ...base,
        status: 'GIA_PRESENTE',
        errors: ['Pratica già presente in piattaforma: riga saltata'],
      });
      continue;
    }

    const match = nsmByGrenke.get(r.contratto_grenke_id);
    if (!match) {
      rows.push({
        ...base,
        status: 'SENZA_NSM',
        errors: ['Contratto assente nel file NSM: canone e dispositivi non disponibili — aggiornare l\'export della piattaforma e ripetere l\'import'],
      });
      continue;
    }
    if (match.errors.length > 0) {
      rows.push({
        ...base,
        status: 'ERRORE',
        contratto_nsm_id: match.contratto_nsm_id,
        errors: match.errors.map((e) => `File NSM: ${e}`),
      });
      continue;
    }

    const pricing = await calcolaPricing(match.canone_mensile, match.numero_mesi, r.pricing_grenke);
    const valore_gift_card = await calcolaValoreGiftCard(pricing.margine_lordo);

    rows.push({
      ...base,
      status: 'PRONTO',
      contratto_nsm_id: match.contratto_nsm_id,
      canone_mensile: match.canone_mensile,
      numero_mesi: match.numero_mesi,
      dispositivi: match.dispositivi,
      pricing: { ...pricing, valore_gift_card },
    });
  }

  // Record NSM non presenti nel file Grenke → scartati
  const grenkeNelFile = new Set(
    grenke.rows.filter((g) => g.ok && g.row).map((g) => g.row!.contratto_grenke_id),
  );
  const nsmScartati = nsm.contratti.filter((c) => !grenkeNelFile.has(c.contratto_grenke_id)).length;

  return {
    grenke_righe: grenke.totalRows,
    nsm_contratti: nsm.contratti.length,
    nsm_scartati: nsmScartati,
    pronti: rows.filter((r) => r.status === 'PRONTO').length,
    senza_nsm: rows.filter((r) => r.status === 'SENZA_NSM').length,
    gia_presenti: rows.filter((r) => r.status === 'GIA_PRESENTE').length,
    errori: rows.filter((r) => r.status === 'ERRORE').length,
    rows,
  };
}

export interface CombinedImportResult {
  creati: number;
  gia_presenti: number;
  senza_nsm: number;
  errori: number;
  nsm_scartati: number;
  contrattiCreati: string[];
}

export async function confirmCombinedImport(
  grenkeBuffer: Buffer,
  nsmBuffer: Buffer,
  prisma: PrismaClient,
): Promise<CombinedImportResult> {
  const preview = await previewCombinedImport(grenkeBuffer, nsmBuffer, prisma);
  const grenke = parseGrenkeFile(grenkeBuffer);
  const grenkeByid = new Map<string, ParsedRow>();
  for (const g of grenke.rows) if (g.ok && g.row) grenkeByid.set(g.row.contratto_grenke_id, g.row);
  const { gruppi } = parseNsmExport(nsmBuffer);

  const result: CombinedImportResult = {
    creati: 0,
    gia_presenti: preview.gia_presenti,
    senza_nsm: preview.senza_nsm,
    errori: preview.errori,
    nsm_scartati: preview.nsm_scartati,
    contrattiCreati: [],
  };

  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

  for (const row of preview.rows) {
    if (row.status !== 'PRONTO') continue;
    const grenkeRow = grenkeByid.get(row.contratto_grenke_id)!;
    const primaNsm = gruppi.get(row.contratto_grenke_id)?.[0];
    const firmatario = primaNsm
      ? [str(primaNsm.firmatario_nome), str(primaNsm.firmatario_cognome)].filter(Boolean).join(' ')
      : '';

    // Cliente: anagrafica dal file NSM (master); email/PEC con fallback Grenke
    const datiCliente = {
      ragione_sociale: row.denominazione,
      codice_fiscale: primaNsm ? str(primaNsm.codice_fiscale) || null : null,
      email: (primaNsm && str(primaNsm.email)) || grenkeRow['cliente.email'],
      pec: (primaNsm && str(primaNsm.pec)) || grenkeRow['cliente.pec'] || null,
      telefono: primaNsm ? str(primaNsm.telefono) || null : null,
      referente_nome: firmatario || null,
      referente_telefono: primaNsm ? str(primaNsm.firmatario_telefono) || null : null,
      indirizzo_sede: primaNsm ? str(primaNsm.indirizzo) || null : null,
      cap: primaNsm ? str(primaNsm.cap) || null : null,
      citta: primaNsm ? str(primaNsm.citta) || null : null,
      provincia: primaNsm ? str(primaNsm.provincia) || null : null,
    };

    const piva = grenkeRow['cliente.piva'];
    const cliente = await prisma.cliente.upsert({
      where: { piva },
      update: datiCliente,
      create: { piva, ...datiCliente },
    });

    const canone = row.canone_mensile!;
    const mesi = row.numero_mesi!;
    const monteCanoni = round2(canone * mesi);
    const pricing = row.pricing!;

    const contratto = await prisma.contratto_EOL.create({
      data: {
        contratto_nsm_id: row.contratto_nsm_id!,
        contratto_grenke_id: row.contratto_grenke_id,
        cliente_id: cliente.id,
        data_stipula: grenkeRow.data_stipula ?? new Date(),
        data_scadenza: grenkeRow.data_scadenza,
        canone_mensile: canone,
        numero_mesi: mesi,
        monte_canoni: monteCanoni,
        beni_json: JSON.stringify(row.dispositivi ?? []),
        pricing_riacquisto: pricing.pricing_riacquisto,
        pricing_grenke: pricing.pricing_grenke,
        margine_lordo: pricing.margine_lordo,
        valore_gift_card: pricing.valore_gift_card,
        stato: 'LISTA_RICEVUTA',
        origine: row.origine || 'Smartcom',
        data_importazione: new Date(),
        stato_riconciliazione: 'RICONCILIATO_AUTO',
        token_accesso_cliente: null,
      },
    });

    // Token di accesso area cliente
    const exp = Math.floor((grenkeRow.data_scadenza.getTime() - JWT_EXPIRES_OFFSET_DAYS * 86400000) / 1000);
    const token = jwt.sign({ contratto_eol_id: contratto.id, cliente_id: cliente.id, exp }, JWT_SECRET);
    await prisma.contratto_EOL.update({
      where: { id: contratto.id },
      data: { token_accesso_cliente: token },
    });

    result.contrattiCreati.push(contratto.id);
    result.creati++;
  }

  return result;
}
