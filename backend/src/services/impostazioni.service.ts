import crypto from 'crypto';
import { prisma } from '../lib/db.js';

export async function get(chiave: string) {
  const imp = await prisma.impostazione.findUnique({ where: { chiave } });
  if (!imp) return null;
  return imp;
}

export async function getCategoria(categoria: string) {
  return prisma.impostazione.findMany({
    where: { categoria },
    orderBy: { chiave: 'asc' },
  });
}

export async function getAll() {
  const all = await prisma.impostazione.findMany({ orderBy: { chiave: 'asc' } });
  const grouped: Record<string, typeof all> = {};
  for (const imp of all) {
    if (!grouped[imp.categoria]) grouped[imp.categoria] = [];
    grouped[imp.categoria]!.push(imp);
  }
  return grouped;
}

export async function set(
  chiave: string,
  valore: string,
  utente_id: string,
): Promise<{ success: boolean; errore?: string }> {
  const imp = await prisma.impostazione.findUnique({ where: { chiave } });
  if (!imp) return { success: false, errore: 'Chiave non trovata' };

  const valore_precedente = imp.valore;

  await prisma.impostazione.update({
    where: { chiave },
    data: { valore, updated_by_id: utente_id },
  });

  await registraAuditImpostazione(utente_id, chiave, valore_precedente, valore);

  return { success: true };
}

export async function resetDefault(
  chiave: string,
  utente_id: string,
): Promise<{ success: boolean; errore?: string }> {
  const imp = await prisma.impostazione.findUnique({ where: { chiave } });
  if (!imp) return { success: false, errore: 'Chiave non trovata' };

  const valore_precedente = imp.valore;

  await prisma.impostazione.update({
    where: { chiave },
    data: { valore: imp.valore_default, updated_by_id: utente_id },
  });

  await registraAuditImpostazione(utente_id, chiave, valore_precedente, imp.valore_default);

  return { success: true };
}

export async function resetAllDefault(utente_id: string): Promise<number> {
  const all = await prisma.impostazione.findMany();
  let count = 0;
  for (const imp of all) {
    if (imp.valore !== imp.valore_default) {
      await prisma.impostazione.update({
        where: { chiave: imp.chiave },
        data: { valore: imp.valore_default, updated_by_id: utente_id },
      });
      await registraAuditImpostazione(utente_id, imp.chiave, imp.valore, imp.valore_default);
      count++;
    }
  }
  return count;
}

async function registraAuditImpostazione(
  utente_id: string,
  chiave: string,
  valore_precedente: string,
  valore_nuovo: string,
) {
  const timestamp = new Date().toISOString();
  const dati = JSON.stringify({ chiave, valore_precedente, valore_nuovo });

  const lastEvent = await prisma.audit_Event.findFirst({
    where: { contratto_eol_id: null, azione: 'IMPOSTAZIONE_MODIFICATA' },
    orderBy: { timestamp: 'desc' },
    select: { hash_corrente: true },
  });

  const hashPrecedente = lastEvent?.hash_corrente ?? 'GENESIS';
  const hashCorrente = crypto
    .createHash('sha256')
    .update(`${timestamp}|${utente_id}|IMPOSTAZIONE_MODIFICATA|${dati}|${hashPrecedente}`)
    .digest('hex');

  await prisma.audit_Event.create({
    data: {
      contratto_eol_id: null,
      timestamp: new Date(timestamp),
      attore_tipo: 'BACKOFFICE',
      attore_id: utente_id,
      azione: 'IMPOSTAZIONE_MODIFICATA',
      dati_json: dati,
      hash_precedente: hashPrecedente,
      hash_corrente: hashCorrente,
    },
  });
}
