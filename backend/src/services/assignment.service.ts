import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const configDir = resolve(__dirname, '../../../config');
const assignmentRules = JSON.parse(
  readFileSync(resolve(configDir, 'assignment_rules.json'), 'utf-8'),
);

export interface AssignmentResult {
  agenteAssegnatoId: string | null;
  motivoAssegnazione: string;
}

export async function assegnaPratica(
  contrattoEolId: string,
): Promise<AssignmentResult> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { agente_originario: true },
  });

  if (!contratto) {
    return { agenteAssegnatoId: null, motivoAssegnazione: 'contratto_non_trovato' };
  }

  const soglia = assignmentRules.soglia_alto_valore_eur as number;

  // Priorità 1: agente originario attivo
  if (contratto.agente_originario && contratto.agente_originario.attivo) {
    return {
      agenteAssegnatoId: contratto.agente_originario.id,
      motivoAssegnazione: 'agente_originario',
    };
  }

  // Priorità 2: monte_canoni >= soglia → Capo Area
  if (Number(contratto.monte_canoni) >= soglia) {
    const capoArea = await prisma.utente_NSM.findFirst({
      where: { ruolo: 'CAPO_AREA', attivo: true },
    });
    if (capoArea) {
      return {
        agenteAssegnatoId: capoArea.id,
        motivoAssegnazione: 'capo_area',
      };
    }
  }

  // Priorità 3: fallback BACKOFFICE_INTERNO
  const teamBackoffice = await prisma.utente_NSM.findFirst({
    where: { ruolo: 'BACKOFFICE_INTERNO', attivo: true },
  });

  return {
    agenteAssegnatoId: teamBackoffice?.id || null,
    motivoAssegnazione: 'backoffice_interno',
  };
}
