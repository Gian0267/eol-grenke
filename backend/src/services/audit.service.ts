import crypto from 'crypto';
import { prisma } from '../lib/db.js';

export type AttoreTipo = 'SISTEMA' | 'CLIENTE' | 'BACKOFFICE';

export type AzioneAudit =
  | 'PRATICA_CREATA'
  | 'COMUNICAZIONE_INVIATA'
  | 'LINK_APERTO_DAL_CLIENTE'
  | 'DECISIONE_PRESA'
  | 'OTP_VERIFICATO'
  | 'PAGAMENTO_INIZIATO'
  | 'PAGAMENTO_COMPLETATO'
  | 'PAGAMENTO_FALLITO'
  | 'RICHIESTA_CONTATTO_CREATA'
  | 'TASK_ESCALATION_CREATO'
  | 'TASK_ESCALATION_COMPLETATO'
  | 'SILENZIO_DEFINITO'
  | 'MODIFICA_BACKOFFICE'
  | 'PRATICA_CHIUSA'
  | 'LISTA_RIACQUISTI_GENERATA';

function calcolaHash(
  timestamp: string,
  attore_id: string,
  azione: string,
  datiJson: string,
  hashPrecedente: string,
): string {
  return crypto
    .createHash('sha256')
    .update(`${timestamp}|${attore_id}|${azione}|${datiJson}|${hashPrecedente}`)
    .digest('hex');
}

export async function registraEvento(
  contratto_eol_id: string | null,
  attore_tipo: AttoreTipo,
  attore_id: string,
  azione: AzioneAudit | string,
  dati: Record<string, unknown>,
): Promise<void> {
  try {
    const lastEvent = await prisma.audit_Event.findFirst({
      where: { contratto_eol_id },
      orderBy: { timestamp: 'desc' },
      select: { hash_corrente: true },
    });

    const hashPrecedente = lastEvent?.hash_corrente ?? 'GENESIS';
    const timestamp = new Date().toISOString();
    const datiJson = JSON.stringify(dati);
    const hashCorrente = calcolaHash(timestamp, attore_id, azione, datiJson, hashPrecedente);

    await prisma.audit_Event.create({
      data: {
        contratto_eol_id,
        timestamp: new Date(timestamp),
        attore_tipo,
        attore_id,
        azione,
        dati_json: datiJson,
        hash_precedente: hashPrecedente,
        hash_corrente: hashCorrente,
      },
    });
  } catch (err) {
    console.error(`[Audit] Errore registrazione evento ${azione} per ${contratto_eol_id}:`, err);
  }
}

export async function verificaCatena(contratto_eol_id: string): Promise<{
  integra: boolean;
  eventi: number;
  primo_evento: string | null;
  ultimo_evento: string | null;
  errore_al_evento_N?: string;
}> {
  const eventi = await prisma.audit_Event.findMany({
    where: { contratto_eol_id },
    orderBy: { timestamp: 'asc' },
  });

  if (eventi.length === 0) {
    return { integra: true, eventi: 0, primo_evento: null, ultimo_evento: null };
  }

  const primo = eventi[0]!;
  const ultimo = eventi[eventi.length - 1]!;
  let hashAtteso = 'GENESIS';

  for (let i = 0; i < eventi.length; i++) {
    const ev = eventi[i]!;

    if (ev.hash_precedente !== hashAtteso) {
      return {
        integra: false,
        eventi: eventi.length,
        primo_evento: primo.timestamp.toISOString(),
        ultimo_evento: ultimo.timestamp.toISOString(),
        errore_al_evento_N: `Evento ${i + 1}: hash_precedente non corrisponde (atteso ${hashAtteso.substring(0, 16)}..., trovato ${ev.hash_precedente.substring(0, 16)}...)`,
      };
    }

    const hashRicalcolato = calcolaHash(
      ev.timestamp.toISOString(),
      ev.attore_id,
      ev.azione,
      ev.dati_json,
      ev.hash_precedente,
    );

    if (hashRicalcolato !== ev.hash_corrente) {
      return {
        integra: false,
        eventi: eventi.length,
        primo_evento: primo.timestamp.toISOString(),
        ultimo_evento: ultimo.timestamp.toISOString(),
        errore_al_evento_N: `Evento ${i + 1}: hash_corrente non corrisponde (ricalcolato ${hashRicalcolato.substring(0, 16)}..., stored ${ev.hash_corrente.substring(0, 16)}...)`,
      };
    }

    hashAtteso = ev.hash_corrente;
  }

  return {
    integra: true,
    eventi: eventi.length,
    primo_evento: primo.timestamp.toISOString(),
    ultimo_evento: ultimo.timestamp.toISOString(),
  };
}

export { calcolaHash };
