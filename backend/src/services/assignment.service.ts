import { prisma } from '../lib/db.js';
import * as configService from './config.service.js';

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

  const soglia = await configService.getNumero('pricing.soglia_alto_valore', 5000);

  if (contratto.agente_originario && contratto.agente_originario.attivo) {
    return {
      agenteAssegnatoId: contratto.agente_originario.id,
      motivoAssegnazione: 'agente_originario',
    };
  }

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

  const teamBackoffice = await prisma.utente_NSM.findFirst({
    where: { ruolo: 'BACKOFFICE_INTERNO', attivo: true },
  });

  return {
    agenteAssegnatoId: teamBackoffice?.id || null,
    motivoAssegnazione: 'backoffice_interno',
  };
}
