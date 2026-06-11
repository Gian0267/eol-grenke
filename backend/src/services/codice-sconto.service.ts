import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import * as configService from './config.service.js';
import { registraEvento } from './audit.service.js';
import type { Codice_Sconto } from '@prisma/client';

/**
 * Codici sconto "Premio Fedeltà: Sconto Copertura Bronze".
 *
 * Il codice è una chiave OPACA: il valore vive solo nel DB. La riduzione del
 * canone della copertura Bronze (valore vs coefficiente finanziaria, floor a
 * zero) è calcolata dalla piattaforma noleggio esterna — fuori perimetro.
 */

// 31 simboli: A-Z senza O/I/L, cifre senza 0/1 — evita errori di trascrizione
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ATTORE_SISTEMA = 'CODICE_SCONTO_SERVICE';
const MAX_TENTATIVI = 5;

function generaStringaCasuale(len: number): string {
  // rejection sampling: accetta solo byte < 248 (31 × 8) per azzerare il modulo bias
  let out = '';
  while (out.length < len) {
    const bytes = crypto.randomBytes(len * 2);
    for (const b of bytes) {
      if (b < 248) {
        out += CHARSET[b % CHARSET.length];
        if (out.length === len) break;
      }
    }
  }
  return out;
}

export function generaCodiceCasuale(): string {
  const s = generaStringaCasuale(8);
  return `NSM-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

function aggiungiMesi(data: Date, mesi: number): Date {
  const d = new Date(data);
  d.setMonth(d.getMonth() + mesi);
  return d;
}

/**
 * Genera il codice sconto per un contratto EOL.
 * IDEMPOTENTE: se esiste già un codice GENERATO per il contratto, lo restituisce
 * senza crearne un secondo (e senza nuovo audit event).
 */
export async function generaCodice(contratto_eol_id: string): Promise<Codice_Sconto> {
  const esistente = await prisma.codice_Sconto.findFirst({
    where: { contratto_eol_id, stato: 'GENERATO' },
  });
  if (esistente) return esistente;

  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contratto_eol_id },
    include: { cliente: true },
  });
  if (!contratto) throw new Error(`Contratto EOL ${contratto_eol_id} non trovato`);

  const validitaMesi = await configService.getNumero('pricing.gift_card_validita_mesi', 12);
  const dataScadenza = aggiungiMesi(new Date(), validitaMesi);
  const valoreEur = Number(contratto.valore_gift_card);

  let codiceCreato: Codice_Sconto | null = null;
  for (let tentativo = 1; tentativo <= MAX_TENTATIVI; tentativo++) {
    const codice = generaCodiceCasuale();
    try {
      codiceCreato = await prisma.codice_Sconto.create({
        data: {
          codice,
          valore_eur: valoreEur,
          contratto_eol_id,
          cliente_id: contratto.cliente_id,
          piva_cliente: contratto.cliente.piva,
          stato: 'GENERATO',
          data_scadenza: dataScadenza,
        },
      });
      break;
    } catch (err) {
      // P2002 = violazione unique su `codice` (collisione): rigenera e riprova
      if ((err as { code?: string }).code === 'P2002' && tentativo < MAX_TENTATIVI) continue;
      throw err;
    }
  }
  if (!codiceCreato) throw new Error('Generazione codice sconto fallita: troppe collisioni');

  await registraEvento(contratto_eol_id, 'SISTEMA', ATTORE_SISTEMA, 'CODICE_SCONTO_GENERATO', {
    codice: codiceCreato.codice,
    valore_eur: valoreEur,
    data_scadenza: dataScadenza.toISOString(),
  });

  return codiceCreato;
}

/** Ultimo codice sconto del contratto (per dettaglio pratica / email). */
export async function getCodicePerContratto(contratto_eol_id: string): Promise<Codice_Sconto | null> {
  return prisma.codice_Sconto.findFirst({
    where: { contratto_eol_id },
    orderBy: { data_generazione: 'desc' },
  });
}

/** Segna il codice come UTILIZZATO (uso manuale backoffice finché non c'è integrazione API). */
export async function marcaUtilizzato(id: string, attore_id: string): Promise<Codice_Sconto> {
  const codice = await prisma.codice_Sconto.findUnique({ where: { id } });
  if (!codice) throw new Error('Codice sconto non trovato');
  if (codice.stato !== 'GENERATO') {
    throw new Error(`Codice non in stato GENERATO (stato attuale: ${codice.stato})`);
  }

  const aggiornato = await prisma.codice_Sconto.update({
    where: { id },
    data: { stato: 'UTILIZZATO', data_utilizzo: new Date() },
  });

  await registraEvento(codice.contratto_eol_id, 'BACKOFFICE', attore_id, 'CODICE_SCONTO_UTILIZZATO', {
    codice: codice.codice,
    valore_eur: Number(codice.valore_eur),
  });

  return aggiornato;
}

/** Annulla il codice (motivo obbligatorio). */
export async function annullaCodice(id: string, motivo: string, attore_id: string): Promise<Codice_Sconto> {
  const codice = await prisma.codice_Sconto.findUnique({ where: { id } });
  if (!codice) throw new Error('Codice sconto non trovato');
  if (codice.stato !== 'GENERATO') {
    throw new Error(`Codice non in stato GENERATO (stato attuale: ${codice.stato})`);
  }

  const aggiornato = await prisma.codice_Sconto.update({
    where: { id },
    data: { stato: 'ANNULLATO', note: motivo },
  });

  await registraEvento(codice.contratto_eol_id, 'BACKOFFICE', attore_id, 'CODICE_SCONTO_ANNULLATO', {
    codice: codice.codice,
    motivo,
  });

  return aggiornato;
}

/**
 * Passa a SCADUTO i codici GENERATO con data_scadenza superata.
 * Idempotente per costruzione (filtra su stato GENERATO). Usata dallo scheduler.
 */
export async function scadiCodici(referenceDate: Date = new Date()): Promise<number> {
  const daScadere = await prisma.codice_Sconto.findMany({
    where: { stato: 'GENERATO', data_scadenza: { lt: referenceDate } },
  });

  for (const codice of daScadere) {
    await prisma.codice_Sconto.update({
      where: { id: codice.id },
      data: { stato: 'SCADUTO' },
    });
    await registraEvento(codice.contratto_eol_id, 'SISTEMA', ATTORE_SISTEMA, 'CODICE_SCONTO_SCADUTO', {
      codice: codice.codice,
      data_scadenza: codice.data_scadenza.toISOString(),
    });
  }

  return daScadere.length;
}
