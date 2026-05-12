import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { createWriteStream, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storagePath = resolve(__dirname, '../../../backend/storage/pdfs');
const prisma = new PrismaClient();

const ISTRUZIONI_OPERATIVE = [
  'Disabilita "Trova il mio iPhone" (Apple) o Samsung Knox / Google FRP su tutti i dispositivi oggetto della restituzione.',
  'Esegui il ripristino alle impostazioni di fabbrica (factory reset) di ogni dispositivo.',
  'Verifica l\'integrità del bene: il dispositivo deve essere funzionante, privo di danni evidenti, e comprensivo di tutti gli accessori originali (caricatore, cavo, ecc.).',
  'Imballa ogni dispositivo nel packaging originale o, in assenza, in un imballo adeguato che garantisca la protezione durante il trasporto.',
  'Spedisci il pacco a: Smartcom Solutions Srl, Via Tunisia 5, 10093 Collegno (TO). Le spese di spedizione sono a carico del cliente.',
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface FirmaInfo {
  nome: string;
  ip: string;
  userAgent: string;
  otpVerificato: boolean;
}

export async function generaVerbaleRestituzione(
  contrattoEolId: string,
  decisioneId: string,
  firma: FirmaInfo,
): Promise<{ pdfPath: string; hash: string }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });

  if (!contratto) throw new Error('Contratto non trovato');

  let beni: Array<{ descrizione?: string; marca?: string; modello?: string; seriale?: string }> = [];
  try { beni = JSON.parse(contratto.beni_json); } catch {}

  const timestamp = Date.now();
  const filename = `verbale_restituzione_${contrattoEolId}_${timestamp}.pdf`;
  const pdfPath = resolve(storagePath, filename);

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: 'Verbale di conferma restituzione',
    Author: 'Noleggio Su Misura — Smartcom Solutions Srl',
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

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a3a52')
    .text('Verbale di conferma restituzione', { align: 'center' });
  doc.moveDown(1.5);

  // Dati cliente
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
    .text('Dati del cliente');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Ragione sociale: ${contratto.cliente.ragione_sociale}`);
  doc.text(`P.IVA: ${contratto.cliente.piva}`);
  if (contratto.cliente.indirizzo_sede || contratto.cliente.citta) {
    const sede = [contratto.cliente.indirizzo_sede, contratto.cliente.cap, contratto.cliente.citta, contratto.cliente.provincia].filter(Boolean).join(', ');
    doc.text(`Sede: ${sede}`);
  }
  doc.moveDown(1);

  // Dati contratto
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Dati del contratto');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Numero contratto NSM: ${contratto.contratto_nsm_id}`);
  doc.text(`Numero contratto Grenke: ${contratto.contratto_grenke_id}`);
  doc.text(`Data scadenza: ${formatDate(new Date(contratto.data_scadenza))}`);
  doc.text(`Monte canoni: € ${formatEur(Number(contratto.monte_canoni))}`);
  doc.moveDown(1);

  // Elenco beni
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Beni oggetto della restituzione');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  if (beni.length === 0) {
    doc.text('Beni come da contratto');
  } else {
    beni.forEach((bene, i) => {
      const parts = [bene.descrizione || 'N/D'];
      if (bene.marca) parts.push(bene.marca);
      if (bene.modello) parts.push(bene.modello);
      if (bene.seriale) parts.push(`S/N: ${bene.seriale}`);
      doc.text(`${i + 1}. ${parts.join(' — ')}`);
    });
  }
  doc.moveDown(1);

  // Istruzioni operative
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Istruzioni operative per la restituzione');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  ISTRUZIONI_OPERATIVE.forEach((istruzione, i) => {
    doc.text(`${i + 1}. ${istruzione}`, { indent: 10, paragraphGap: 4 });
  });
  doc.moveDown(1);

  // Termini
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Termini di restituzione conforme');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica');
  doc.text(
    'Il cliente dichiara di aver preso visione delle condizioni di restituzione e si impegna a ' +
    'restituire i beni in stato integro e funzionante, comprensivi di tutti gli accessori originali, ' +
    'entro 10 giorni dalla data di scadenza del contratto. In caso di restituzione non conforme ' +
    '(danni, accessori mancanti, dispositivo non resettato), potranno essere applicati addebiti ' +
    'secondo quanto previsto dalle condizioni contrattuali.',
    { align: 'justify' },
  );
  doc.moveDown(1.5);

  // Sezione firma mock
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a3a52')
    .text('Firma elettronica');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#000000');
  doc.text(`Nome: ${firma.nome}`);
  doc.text(`Data: ${formatDate(new Date())} ore ${new Date().toLocaleTimeString('it-IT')}`);
  doc.text(`Indirizzo IP: ${firma.ip}`);
  doc.text(`OTP verificato: ${firma.otpVerificato ? 'Si' : 'No'}`);
  doc.moveDown(1);

  // Nota mock
  doc.rect(50, doc.y, 495, 50).fill('#fff3cd');
  const noteY = doc.y + 10;
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#856404')
    .text(
      'Documento firmato elettronicamente in modalita MOCK. ' +
      'Per uso in produzione integrare provider FEA certificato eIDAS (es. Namirial, InfoCert, Aruba).',
      60, noteY, { width: 475 },
    );

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Calcola SHA-256
  const pdfBuffer = readFileSync(pdfPath);
  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // Aggiorna Decisione_Cliente
  await prisma.decisione_Cliente.update({
    where: { id: decisioneId },
    data: { pdf_conferma_path: pdfPath, hash_pdf: hash },
  });

  console.log(`[PDF] Verbale generato: ${filename} (hash: ${hash.substring(0, 16)}...)`);

  return { pdfPath, hash };
}
