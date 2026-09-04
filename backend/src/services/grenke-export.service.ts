import XLSX from 'xlsx';
import { writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registraEvento } from './audit.service.js';
import { parseBeni, parseEsclusi } from '../lib/beni.js';
import pricingRules from '../../../config/pricing_rules.json' with { type: 'json' };
import { prisma } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exportDir = resolve(__dirname, '../../../backend/storage/grenke-exports');

export interface GrenkeExportRow {
  contratto_id: string;
  contratto_grenke_id: string;
  ragione_sociale: string;
  piva: string;
  data_scadenza: string;
  importo_netto: number;
  importo_iva: number;
  importo_totale: number;
  stato_pagamento: string;
  note: string;
}

export async function previewExport(da: string, a: string, ambiente: 'TEST' | 'LIVE' = 'LIVE'): Promise<GrenkeExportRow[]> {
  const pratiche = await prisma.contratto_EOL.findMany({
    where: {
      stato: 'RIACQUISTO_PAGATO',
      ambiente,
      data_scadenza: { gte: new Date(da), lte: new Date(a) },
    },
    include: {
      cliente: true,
      pagamenti: { where: { stato: 'COMPLETATO' }, orderBy: { data_completato: 'desc' }, take: 1 },
    },
    orderBy: { data_scadenza: 'asc' },
  });

  // Gli importi verso Grenke sono SEMPRE quelli dell'intero contratto
  // (pricing_grenke), mai quanto ha pagato il cliente: se al cliente e' stato
  // concesso di riscattare solo una parte dei dispositivi, noi acquistiamo
  // comunque tutto. Usare l'importo del pagamento cliente sottostimerebbe il
  // dovuto proprio nei casi in cui i due valori divergono.
  const iva = Number(pricingRules.iva_percentuale) || 0;

  return pratiche.map(p => {
    const pag = p.pagamenti[0];
    const netto = Number(p.pricing_grenke);
    const importo_iva = Math.round(netto * iva * 100) / 100;
    const esclusi = parseEsclusi(p.beni_esclusi_json);
    const totBeni = parseBeni(p.beni_json).length;
    return {
      contratto_id: p.id,
      contratto_grenke_id: p.contratto_grenke_id,
      ragione_sociale: p.cliente.ragione_sociale,
      piva: p.cliente.piva,
      data_scadenza: new Date(p.data_scadenza!).toLocaleDateString('it-IT'),
      importo_netto: netto,
      importo_iva,
      importo_totale: Math.round((netto + importo_iva) * 100) / 100,
      stato_pagamento: pag?.stato || 'N/D',
      note: esclusi.length > 0
        ? `Riacquisto cliente parziale (${totBeni - esclusi.length} di ${totBeni} dispositivi): acquisto da Grenke integrale`
        : '',
    };
  });
}

export async function generaExcel(
  da: string,
  a: string,
  esclusi: string[],
  operatoreId: string,
  ambiente: 'TEST' | 'LIVE' = 'LIVE',
): Promise<{ filename: string; filepath: string; righe: number }> {
  const all = await previewExport(da, a, ambiente);
  const rows = all.filter(r => !esclusi.includes(r.contratto_id));

  const wsData = [
    ['Numero contratto Grenke', 'Ragione sociale', 'P.IVA', 'Data scadenza', 'Importo riacquisto netto', 'IVA', 'Totale', 'Stato pagamento cliente', 'Note'],
    ...rows.map(r => [
      r.contratto_grenke_id,
      r.ragione_sociale,
      r.piva,
      r.data_scadenza,
      r.importo_netto,
      r.importo_iva,
      r.importo_totale,
      r.stato_pagamento,
      r.note,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 25 }, { wch: 35 }, { wch: 15 }, { wch: 14 },
    { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Riacquisti');

  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ts = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = ambiente === 'TEST' ? `TEST_lista_riacquisti_${ym}_${ts}.xlsx` : `lista_riacquisti_${ym}_${ts}.xlsx`;
  const filepath = resolve(exportDir, filename);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(filepath, buffer);

  for (const r of rows) {
    await registraEvento(r.contratto_id, 'BACKOFFICE', operatoreId, 'LISTA_RIACQUISTI_GENERATA', {
      filename,
      periodo: { da, a },
    });
  }

  return { filename, filepath, righe: rows.length };
}

export function getStorico(): Array<{ filename: string; data: string; size: number }> {
  try {
    const files = readdirSync(exportDir)
      .filter(f => f.startsWith('lista_riacquisti_') && f.endsWith('.xlsx'))
      .sort()
      .reverse();

    return files.map(f => {
      const stat = statSync(resolve(exportDir, f));
      return {
        filename: f,
        data: stat.mtime.toISOString(),
        size: stat.size,
      };
    });
  } catch {
    return [];
  }
}
