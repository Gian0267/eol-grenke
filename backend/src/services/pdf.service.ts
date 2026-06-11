import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { verificaCatena } from './audit.service.js';
import { prisma } from '../lib/db.js';
import { saveDocument } from './storage.service.js';

/** Raccoglie l'output di un documento PDFKit in un Buffer in memoria. */
function collectPdf(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

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
): Promise<{ pdfPath: string; hash: string; buffer: Buffer }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });

  if (!contratto) throw new Error('Contratto non trovato');

  let beni: Array<{ descrizione?: string; marca?: string; modello?: string; seriale?: string }> = [];
  try { beni = JSON.parse(contratto.beni_json); } catch {}

  const timestamp = Date.now();
  const filename = `verbale_restituzione_${contrattoEolId}_${timestamp}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: 'Verbale di conferma restituzione',
    Author: 'Noleggio Su Misura — Smartcom Solutions Srl',
  }});

  const pdfDone = collectPdf(doc);

  // Header
  doc.fontSize(16).font('Helvetica-Bold')
    .text('NSM', 50, 50, { continued: true })
    .fontSize(10).font('Helvetica')
    .text('  Noleggio Su Misura', { continued: false });
  doc.fontSize(8).fillColor('#666666')
    .text('Noleggio Su Misura è la divisione rental di Smartcom Solutions Srl');
  doc.fillColor('#000000');

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
  doc.text(`Data scadenza: ${formatDate(new Date(contratto.data_scadenza!))}`);
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
  doc.moveDown(0.5);
  // Addebito per mancata restituzione: costo Grenke maggiorato del 20%
  const importoAddebito = Math.round(Number(contratto.pricing_grenke) * 1.2 * 100) / 100;
  doc.font('Helvetica-Bold').text(
    `Sono consapevole che, se il o i prodotti non venissero restituiti, questi mi verranno ` +
    `addebitati per l'importo di € ${formatEur(importoAddebito)}.`,
    { align: 'justify' },
  );
  doc.font('Helvetica');
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

  doc.end();
  const pdfBuffer = await pdfDone;

  // Calcola SHA-256
  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // Salva su storage (Supabase o locale) e ottieni il riferimento
  const pdfRef = await saveDocument(pdfBuffer, filename);

  // Aggiorna Decisione_Cliente
  await prisma.decisione_Cliente.update({
    where: { id: decisioneId },
    data: { pdf_conferma_path: pdfRef, hash_pdf: hash },
  });

  console.log(`[PDF] Verbale generato: ${filename} (hash: ${hash.substring(0, 16)}...)`);

  return { pdfPath: pdfRef, hash, buffer: pdfBuffer };
}

export interface PrequalificazioneRinnovo {
  tipo_device: string;
  numero_device: number;
  durata_desiderata: number;
  budget_mensile?: number;
  note?: string;
}

export async function generaConfermaRinnovo(
  contrattoEolId: string,
  decisioneId: string,
  prequalificazione: PrequalificazioneRinnovo,
  firma: FirmaInfo,
): Promise<{ pdfPath: string; hash: string; buffer: Buffer }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });

  if (!contratto) throw new Error('Contratto non trovato');

  let beni: Array<{ descrizione?: string }> = [];
  try { beni = JSON.parse(contratto.beni_json); } catch {}

  const timestamp = Date.now();
  const filename = `conferma_rinnovo_${contrattoEolId}_${timestamp}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: 'Conferma interesse al rinnovo',
    Author: 'Noleggio Su Misura - Smartcom Solutions Srl',
  }});

  const pdfDone = collectPdf(doc);

  // Header
  doc.fontSize(16).font('Helvetica-Bold')
    .text('NSM', 50, 50, { continued: true })
    .fontSize(10).font('Helvetica')
    .text('  Noleggio Su Misura', { continued: false });

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1a3a52');
  doc.moveDown(0.8);

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#16a34a')
    .text('Conferma interesse al rinnovo', { align: 'center' });
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

  // Dati contratto in scadenza
  doc.fontSize(12).font('Helvetica-Bold')
    .text('Contratto in scadenza');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Numero contratto NSM: ${contratto.contratto_nsm_id}`);
  doc.text(`Numero contratto Grenke: ${contratto.contratto_grenke_id}`);
  doc.text(`Data scadenza: ${formatDate(new Date(contratto.data_scadenza!))}`);
  doc.text(`Monte canoni: EUR ${formatEur(Number(contratto.monte_canoni))}`);
  doc.text(`Beni attuali: ${beni.map(b => b.descrizione || 'N/D').join(', ') || 'Come da contratto'}`);
  doc.moveDown(1);

  // Pre-qualificazione
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#16a34a')
    .text('Dati di pre-qualificazione per il nuovo contratto FLEX');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#000000');
  doc.text(`Tipo device desiderato: ${prequalificazione.tipo_device}`);
  doc.text(`Numero device: ${prequalificazione.numero_device}`);
  doc.text(`Durata desiderata: ${prequalificazione.durata_desiderata} mesi`);
  if (prequalificazione.budget_mensile) {
    doc.text(`Budget orientativo mensile: EUR ${formatEur(prequalificazione.budget_mensile)}`);
  }
  if (prequalificazione.note) {
    doc.text(`Note: ${prequalificazione.note}`);
  }
  doc.moveDown(1);

  // Gift card
  doc.rect(50, doc.y, 495, 45).fill('#dcfce7');
  const gcY = doc.y + 12;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#166534')
    .text(
      `Alla firma del nuovo contratto FLEX riceverai una gift card Smartcom Solutions da EUR ${formatEur(Number(contratto.valore_gift_card))}`,
      60, gcY, { width: 475, align: 'center' },
    );
  doc.y = gcY + 35;
  doc.moveDown(1);

  // Prossimi passi
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
    .text('Prossimi passi');
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica');
  doc.text('1. Un agente NSM ti contattera entro 5 giorni lavorativi per definire i dettagli del nuovo contratto FLEX.');
  doc.text('2. Riceverai una proposta personalizzata in base alle tue esigenze.');
  doc.text('3. Alla firma del nuovo contratto riceverai la gift card Smartcom Solutions.');
  doc.moveDown(1.5);

  // Sezione firma
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

  doc.end();
  const pdfBuffer = await pdfDone;

  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // Salva su storage (Supabase o locale) e ottieni il riferimento
  const pdfRef = await saveDocument(pdfBuffer, filename);

  await prisma.decisione_Cliente.update({
    where: { id: decisioneId },
    data: { pdf_conferma_path: pdfRef, hash_pdf: hash },
  });

  console.log(`[PDF] Conferma rinnovo generata: ${filename} (hash: ${hash.substring(0, 16)}...)`);

  return { pdfPath: pdfRef, hash, buffer: pdfBuffer };
}

const ACCENT_MAP: Record<string, string> = {
  'à': 'a', 'è': 'e', 'é': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
  'À': 'A', 'È': 'E', 'É': 'E', 'Ì': 'I', 'Ò': 'O', 'Ù': 'U',
};

function toAscii(s: string): string {
  return s.replace(/[àèéìòùÀÈÉÌÒÙ]/g, c => ACCENT_MAP[c] || c);
}

export async function generaAuditExport(
  contrattoEolId: string,
): Promise<{ pdfPath: string; hash: string; buffer: Buffer }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });
  if (!contratto) throw new Error('Contratto non trovato');

  const eventi = await prisma.audit_Event.findMany({
    where: { contratto_eol_id: contrattoEolId },
    orderBy: { timestamp: 'asc' },
  });

  const catena = await verificaCatena(contrattoEolId);

  const timestamp = Date.now();
  const filename = `audit_export_${contrattoEolId}_${timestamp}.pdf`;

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: toAscii('Audit trail — catena di hash'),
    Author: 'Noleggio Su Misura — Smartcom Solutions Srl',
  }});

  const pdfDone = collectPdf(doc);

  doc.fontSize(16).font('Helvetica-Bold')
    .text('NSM', 50, 50, { continued: true })
    .fontSize(10).font('Helvetica')
    .text('  Noleggio Su Misura', { continued: false });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1a3a52');
  doc.moveDown(0.8);

  doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a3a52')
    .text(toAscii('Audit Trail — Catena di Hash Crittografica'), { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica').fillColor('#000000');
  doc.text(toAscii(`Contratto NSM: ${contratto.contratto_nsm_id}`));
  doc.text(toAscii(`Contratto Grenke: ${contratto.contratto_grenke_id}`));
  doc.text(toAscii(`Cliente: ${contratto.cliente.ragione_sociale} (P.IVA ${contratto.cliente.piva})`));
  doc.text(toAscii(`Stato pratica: ${contratto.stato}`));
  doc.moveDown(0.5);

  const integraTxt = catena.integra ? 'SI' : 'NO';
  const integraColor = catena.integra ? '#16a34a' : '#dc2626';
  doc.fontSize(12).font('Helvetica-Bold').fillColor(integraColor)
    .text(toAscii(`Catena integra: ${integraTxt} — ${catena.eventi} eventi`));
  if (!catena.integra && catena.errore_al_evento_N) {
    doc.fontSize(9).font('Helvetica').fillColor('#dc2626')
      .text(toAscii(catena.errore_al_evento_N));
  }
  doc.moveDown(1);

  doc.fillColor('#000000');

  for (let i = 0; i < eventi.length; i++) {
    const ev = eventi[i]!;

    if (doc.y > 680) {
      doc.addPage();
    }

    doc.fontSize(9).font('Helvetica-Bold')
      .text(toAscii(`Evento ${i + 1}: ${ev.azione}`));
    doc.fontSize(8).font('Helvetica');
    doc.text(toAscii(`Timestamp: ${ev.timestamp.toISOString()}`));
    doc.text(toAscii(`Attore: ${ev.attore_tipo} / ${ev.attore_id}`));

    let dati: Record<string, unknown> = {};
    try { dati = JSON.parse(ev.dati_json); } catch {}
    const datiStr = Object.entries(dati).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    if (datiStr) {
      doc.text(toAscii(`Dati: ${datiStr.substring(0, 200)}${datiStr.length > 200 ? '...' : ''}`));
    }

    doc.font('Courier').fontSize(6);
    doc.text(`Hash precedente: ${ev.hash_precedente.substring(0, 64)}`);
    doc.text(`Hash corrente:   ${ev.hash_corrente.substring(0, 64)}`);
    doc.font('Helvetica').fontSize(8);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb');
    doc.moveDown(0.3);
  }

  doc.moveDown(1);
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#6b7280')
    .text(toAscii(`Documento generato il ${formatDate(new Date())} alle ${new Date().toLocaleTimeString('it-IT')}. Catena integra: ${integraTxt}.`));

  doc.end();
  const pdfBuffer = await pdfDone;

  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // Salva su storage (Supabase o locale) e ottieni il riferimento
  const pdfRef = await saveDocument(pdfBuffer, filename);

  console.log(`[PDF] Audit export generato: ${filename} (hash: ${pdfHash.substring(0, 16)}...)`);

  return { pdfPath: pdfRef, hash: pdfHash, buffer: pdfBuffer };
}
