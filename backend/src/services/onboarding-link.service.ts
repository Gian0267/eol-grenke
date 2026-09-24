/**
 * Il link di registrazione a un nuovo noleggio da usare per una pratica.
 *
 * Porta l'identificativo dell'agente: il cliente che si registra da li' viene
 * attribuito a lui. Usare quello sbagliato non e' un dettaglio estetico, sposta
 * una provvigione — per questo non esiste un link di riserva: se non si sa
 * quale usare, si restituisce null e chi chiama decide (di norma: non mostrare
 * l'offerta, invece di mandare il cliente dalla persona sbagliata).
 */
import { prisma } from '../lib/db.js';
import { normalizzaOrigine, origineCorrisponde } from '../lib/origine.js';
import * as configService from './config.service.js';

export async function linkNuovoNoleggioPerPratica(contratto: {
  origine: string | null;
  agenzia?: string | null;
}): Promise<{ link: string | null; motivo: string | null }> {
  const diciture = (await configService.getTesto('iol.diciture_origine', 'Italiaonline\nIOL'))
    .split(/[\n,;]+/).map(d => d.trim()).filter(Boolean);

  // Italiaonline ha un link unico, impostato a parte.
  if (origineCorrisponde(contratto.origine, diciture)) {
    const link = (await configService.getTesto('iol.link_nuovo_noleggio', '')).trim();
    return link
      ? { link, motivo: null }
      : { link: null, motivo: 'Manca il link di registrazione per i clienti Italiaonline (Impostazioni)' };
  }

  if (!contratto.agenzia) {
    return { link: null, motivo: 'La pratica non indica un\'agenzia' };
  }

  // Il legame con l'anagrafica e' il nome scritto nell'export NSM, non una
  // chiave: confronto tollerante, come per le origini.
  const agenzie = await prisma.agenzia.findMany({ select: { nome: true, link_onboarding: true } });
  const cercata = normalizzaOrigine(contratto.agenzia);
  const trovata = agenzie.find(a => normalizzaOrigine(a.nome) === cercata);

  if (!trovata) return { link: null, motivo: `L'agenzia "${contratto.agenzia}" non e' in anagrafica` };
  if (!trovata.link_onboarding) return { link: null, motivo: `L'agenzia "${trovata.nome}" non ha ancora un link di registrazione` };
  return { link: trovata.link_onboarding, motivo: null };
}
