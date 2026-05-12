import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { createWriteStream, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storagePath = resolve(__dirname, '../../../backend/storage/pdfs');

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getNextReceiptNumber(year: number, type: string): Promise<string> {
  const counter = await prisma.$transaction(async (tx) => {
    const existing = await tx.counter.findUnique({
      where: { year_type: { year, type } },
    });

    if (existing) {
      const updated = await tx.counter.update({
        where: { year_type: { year, type } },
        data: { value: existing.value + 1 },
      });
      return updated.value;
    } else {
      const created = await tx.counter.create({
        data: { year, type, value: 1 },
      });
      return created.value;
    }
  });

  return `RP-${year}-${String(counter).padStart(4, '0')}`;
}

export async function generaRicevutaPagamento(
  pagamentoId: string,
): Promise<{ pdfPath: string; fatturaNumero: string; hash: string }> {
  const pagamento = await prisma.pagamento.findUnique({
    where: { id: pagamentoId },
    include: {
      contratto_eol: { include: { cliente: true } },
    },
  });

  if (!pagamento) throw new Error('Pagamento non trovato');

  // Idempotenza: se fattura gia generata, restituisci i dati esistenti
  if (pagamento.fattura_numero && pagamento.fattura_path) {
    return {
      pdfPath: pagamento.fattura_path,
      fatturaNumero: pagamento.fattura_numero,
      hash: '',
    };
  }

  const contratto = pagamento.contratto_eol;
  const cliente = contratto.cliente;
  const now = new Date();
  const year = now.getFullYear();

  const fatturaNumero = await getNextReceiptNumber(year, 'RICEVUTA_PAGAMENTO');

  let beni: Array<{ descrizione?: string }> = [];
  try { beni = JSON.parse(contratto.beni_json); } catch {}

  const filename = `ricevuta_pagamento_${contratto.id}_${Date.now()}.pdf`;
  const pdfPath = resolve(storagePath, filename);

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: `Ricevuta di conferma pagamento ${fatturaNumero}`,
    Author: 'Noleggio Su Misura - Smartcom Solutions Srl',
  }});

  const stream = createWriteStream(pdfPath);
  doc.pipe(stream);

  // Header
  doc.fontSize(16).font('Helvetica-Bold')
    .text('NSM', 50, 50, { continued: true })
    .fontSize(10).font('Helvetica')
    .text('  Noleggio Su Misura', { continued: false });

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1a3a52');
  doc.moveDown(0.8);

  // Titolo
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a3a52')
    .text('RICEVUTA DI CONFERMA PAGAMENTO', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica').fillColor('#333333')
    .text(`N. ${fatturaNumero}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10)
    .text(`Data: ${formatDate(now)}`, { align: 'center' });
  doc.moveDown(1.5);

  // Emittente
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
    .text('Emittente');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text('Smartcom Solutions Srl');
  doc.text('Via Tunisia 5, 10093 Collegno (TO)');
  doc.text('P.IVA: 12345678901');
  doc.moveDown(1);

  // Destinatario
  doc.fontSize(11).font('Helvetica-Bold')
    .text('Destinatario');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(cliente.ragione_sociale);
  doc.text(`P.IVA: ${cliente.piva}`);
  if (cliente.indirizzo_sede || cliente.citta) {
    const sede = [cliente.indirizzo_sede, cliente.cap, cliente.citta, cliente.provincia].filter(Boolean).join(', ');
    doc.text(sede);
  }
  doc.moveDown(1);

  // Riferimento contratto
  doc.fontSize(11).font('Helvetica-Bold')
    .text('Riferimento contratto');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Contratto NSM: ${contratto.contratto_nsm_id}`);
  doc.text(`Contratto Grenke: ${contratto.contratto_grenke_id}`);
  doc.text(`Data scadenza: ${formatDate(new Date(contratto.data_scadenza))}`);
  doc.moveDown(1);

  // Beni
  doc.fontSize(11).font('Helvetica-Bold')
    .text('Beni oggetto del riacquisto');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  if (beni.length === 0) {
    doc.text('Beni come da contratto');
  } else {
    beni.forEach((bene, i) => {
      doc.text(`${i + 1}. ${bene.descrizione || 'N/D'}`);
    });
  }
  doc.moveDown(1);

  // Dettaglio importi
  doc.fontSize(11).font('Helvetica-Bold')
    .text('Dettaglio importi');
  doc.moveDown(0.3);

  const tableTop = doc.y;
  const col1 = 50;
  const col2 = 400;

  doc.fontSize(10).font('Helvetica');
  doc.text('Descrizione', col1, tableTop);
  doc.text('Importo', col2, tableTop, { align: 'right', width: 145 });
  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
  doc.moveDown(0.3);

  doc.text('Riacquisto beni (acconto)', col1, doc.y);
  doc.text(`EUR ${formatEur(Number(pagamento.importo_netto))}`, col2, doc.y - 12, { align: 'right', width: 145 });
  doc.moveDown(0.5);

  doc.text('IVA 22%', col1, doc.y);
  doc.text(`EUR ${formatEur(Number(pagamento.importo_iva))}`, col2, doc.y - 12, { align: 'right', width: 145 });
  doc.moveDown(0.3);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
  doc.moveDown(0.3);

  doc.font('Helvetica-Bold');
  doc.text('TOTALE', col1, doc.y);
  doc.text(`EUR ${formatEur(Number(pagamento.importo_totale))}`, col2, doc.y - 12, { align: 'right', width: 145 });
  doc.moveDown(1.5);

  // Disclaimer fiscale SDI
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#991b1b');
  doc.text(
    'AVVERTENZA: Questo documento non costituisce fattura fiscale ai sensi del DPR 633/72. ' +
    'La fattura elettronica sara emessa tramite Sistema di Interscambio (SDI) dall\'ERP aziendale.',
    { align: 'justify' },
  );
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#666666');
  doc.text(
    'La presente ricevuta attesta l\'avvenuto pagamento dell\'acconto per il riacquisto dei beni sopra indicati. ' +
    'Il trasferimento di proprieta avverra alla data T+11 dalla scadenza del contratto Grenke.',
    { align: 'justify' },
  );
  doc.moveDown(1.5);

  // Footer
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
  doc.moveDown(0.3);
  doc.fontSize(8).fillColor('#999999');
  doc.text('Smartcom Solutions Srl — Via Tunisia 5, 10093 Collegno (TO) — P.IVA 12345678901', { align: 'center' });
  doc.text('Documento generato automaticamente dalla piattaforma Noleggio Su Misura', { align: 'center' });

  doc.end();

  await new Promise<void>((res, rej) => {
    stream.on('finish', res);
    stream.on('error', rej);
  });

  // Hash SHA-256
  const pdfBuffer = readFileSync(pdfPath);
  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // Aggiorna Pagamento
  await prisma.pagamento.update({
    where: { id: pagamentoId },
    data: {
      fattura_numero: fatturaNumero,
      fattura_path: pdfPath,
    },
  });

  console.log(`[Ricevuta] Generata: ${fatturaNumero} — ${filename} (hash: ${hash.substring(0, 16)}...)`);

  return { pdfPath, fatturaNumero, hash };
}
