import XLSX from 'xlsx';
import { writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { registraEvento } from './audit.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const exportDir = resolve(__dirname, '../../../backend/storage/grenke-exports');
const prisma = new PrismaClient();

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

export async function previewExport(da: string, a: string): Promise<GrenkeExportRow[]> {
  const pratiche = await prisma.contratto_EOL.findMany({
    where: {
      stato: 'RIACQUISTO_PAGATO',
      data_scadenza: { gte: new Date(da), lte: new Date(a) },
    },
    include: {
      cliente: true,
      pagamenti: { where: { stato: 'COMPLETATO' }, orderBy: { data_completato: 'desc' }, take: 1 },
    },
    orderBy: { data_scadenza: 'asc' },
  });

  return pratiche.map(p => {
    const pag = p.pagamenti[0];
    return {
      contratto_id: p.id,
      contratto_grenke_id: p.contratto_grenke_id,
      ragione_sociale: p.cliente.ragione_sociale,
      piva: p.cliente.piva,
      data_scadenza: new Date(p.data_scadenza).toLocaleDateString('it-IT'),
      importo_netto: pag ? Number(pag.importo_netto) : Number(p.pricing_riacquisto),
      importo_iva: pag ? Number(pag.importo_iva) : 0,
      importo_totale: pag ? Number(pag.importo_totale) : Number(p.pricing_riacquisto),
      stato_pagamento: pag?.stato || 'N/D',
      note: '',
    };
  });
}

export async function generaExcel(
  da: string,
  a: string,
  esclusi: string[],
  operatoreId: string,
): Promise<{ filename: string; filepath: string; righe: number }> {
  const all = await previewExport(da, a);
  const rows = all.filter(r => !esclusi.includes(r.contratto_id));

  const wsData = [
    ['Numero contratto Grenke', 'Ragione sociale', 'P.IVA', 'Data scadenza', 'Importo riacquisto netto', 'IVA', 'Totale', 'Stato pagamento', 'Note'],
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
  const filename = `lista_riacquisti_${ym}_${ts}.xlsx`;
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
