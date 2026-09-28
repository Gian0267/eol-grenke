/**
 * Le variabili dello sconto per chi attiva un nuovo noleggio, pronte per i
 * template.
 *
 * Stavano scritte due volte — comunicazione iniziale e solleciti — e la terza
 * copia serviva per la proposta commerciale. Tre posti che calcolano lo stesso
 * sconto sono tre occasioni di divergere, e un cliente che legge un importo in
 * una mail e un altro in quella dopo non perdona.
 *
 * Lo sconto si annuncia solo se: il flag e' acceso, la data limite non e'
 * passata, il prezzo non e' stato concordato a mano, e sappiamo dove mandare
 * il cliente a configurare il noleggio. Manca una di queste, `attivo` e' falso
 * e i blocchi condizionali nei template spariscono.
 */
import * as configService from '../services/config.service.js';
import { prezzoRiacquisto } from '../services/pricing.service.js';
import { linkNuovoNoleggioPerPratica } from '../services/onboarding-link.service.js';

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface VariabiliSconto {
  sconto_attivo: boolean;
  sconto_percentuale: number;
  sconto_data_limite: string;
  giorni_al_limite: number;
  prezzo_riacquisto_scontato: string;
  sconto_euro: string;
  link_nuovo_noleggio_sconto: string;
}

type ContrattoPerSconto = Parameters<typeof prezzoRiacquisto>[0] &
  Parameters<typeof linkNuovoNoleggioPerPratica>[0] & { pricing_grenke: unknown };

export async function variabiliSconto(contratto: ContrattoPerSconto): Promise<VariabiliSconto> {
  const prezzo = await prezzoRiacquisto(contratto);
  const percentuale = await configService.getNumero('sconto_nuovo_noleggio.percentuale', 15);
  const flag = await configService.getBooleano('flags.abilita_sconto_nuovo_noleggio', true);
  const link = (await linkNuovoNoleggioPerPratica(contratto)).link;

  const limite = prezzo.data_limite;
  const giorniAlLimite = limite ? Math.ceil((limite.getTime() - Date.now()) / 86400000) : -1;

  // Mai sotto quello che paghiamo a Grenke: sarebbe una perdita, non uno sconto.
  const netto = Math.max(
    Math.round(prezzo.listino * (1 - percentuale / 100) * 100) / 100,
    Number(contratto.pricing_grenke),
  );

  return {
    sconto_attivo:
      flag && !prezzo.prezzo_concordato && !!link && !!limite && giorniAlLimite >= 0 && percentuale > 0,
    sconto_percentuale: percentuale,
    sconto_data_limite: limite ? formatDate(limite) : '',
    giorni_al_limite: giorniAlLimite,
    prezzo_riacquisto_scontato: formatEur(netto),
    sconto_euro: formatEur(Math.round((prezzo.listino - netto) * 100) / 100),
    link_nuovo_noleggio_sconto: link ?? '',
  };
}
