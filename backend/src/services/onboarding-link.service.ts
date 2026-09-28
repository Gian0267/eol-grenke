/**
 * Il link di registrazione a un nuovo noleggio da usare per una pratica.
 *
 * Porta l'identificativo dell'agente: il cliente che si registra da li' viene
 * attribuito a lui, e usare quello sbagliato sposta una provvigione.
 *
 * L'ordine e': link dell'agenzia della pratica, poi — se l'agenzia non c'e' o
 * non ha ancora un link suo — quello generico delle Impostazioni. Prima si
 * restituiva null e l'offerta non partiva: meglio un'attribuzione generica che
 * una vendita persa, ma solo perche' il link generico non e' di nessun agente
 * in particolare. `generico` dice quale dei due e' finito nella mail, cosi' chi
 * chiama puo' deciderne di conseguenza.
 */
import { prisma } from '../lib/db.js';
import { normalizzaOrigine, origineCorrisponde } from '../lib/origine.js';
import * as configService from './config.service.js';

export async function linkNuovoNoleggioPerPratica(contratto: {
  origine: string | null;
  agenzia?: string | null;
}): Promise<{ link: string | null; motivo: string | null; generico?: boolean }> {
  const generico = async (motivo: string) => {
    const link = (await configService.getTesto('link_nuovo_noleggio_generico', '')).trim();
    return link
      ? { link, motivo, generico: true }
      : { link: null, motivo: `${motivo}, e manca il link generico (Impostazioni)`, generico: false };
  };

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
    return generico('La pratica non indica un\'agenzia');
  }

  // Il legame con l'anagrafica e' il nome scritto nell'export NSM, non una
  // chiave: confronto tollerante, come per le origini.
  const agenzie = await prisma.agenzia.findMany({ select: { nome: true, link_onboarding: true } });
  const cercata = normalizzaOrigine(contratto.agenzia);
  const trovata = agenzie.find(a => normalizzaOrigine(a.nome) === cercata);

  if (!trovata) return generico(`L'agenzia "${contratto.agenzia}" non e' in anagrafica`);
  if (!trovata.link_onboarding) return generico(`L'agenzia "${trovata.nome}" non ha ancora un link di registrazione`);
  return { link: trovata.link_onboarding, motivo: null };
}
