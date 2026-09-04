import { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/db.js';
import { MockFabrickProvider } from '../providers/payment/fabrick.provider.js';
import { MockStripeProvider } from '../providers/payment/stripe.provider.js';
import { StripeProvider } from '../providers/payment/stripe.real.provider.js';
import { generaRicevutaPagamento } from './invoice.service.js';
import { registraEvento } from './audit.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pricingRules = JSON.parse(
  readFileSync(resolve(__dirname, '../../../config/pricing_rules.json'), 'utf-8'),
);
const fabrickProvider = new MockFabrickProvider();

// Stripe reale quando c'e' la secret key, altrimenti il simulatore: in
// sviluppo si prova il flusso senza chiavi, in produzione basta valorizzare
// STRIPE_SECRET_KEY perche' l'incasso diventi vero.
export const stripeProvider: MockStripeProvider | StripeProvider = process.env.STRIPE_SECRET_KEY
  ? new StripeProvider(process.env.STRIPE_SECRET_KEY)
  : new MockStripeProvider();

export function stripeAttivo(): boolean {
  return stripeProvider instanceof StripeProvider;
}

// IVA ordinaria sull'intero imponibile (deciso il 04/09/2026, in sostituzione
// dell'IVA a margine). `margine` resta nella firma per non toccare i chiamanti.
function calcolaImporti(netto: number, _margine: number) {
  const centNetto = Math.round(netto * 100);
  const centIva = Math.round(centNetto * pricingRules.iva_percentuale);
  return {
    importo_netto: centNetto / 100,
    importo_iva: centIva / 100,
    importo_totale: (centNetto + centIva) / 100,
  };
}

export async function initiatePayment(
  contrattoEolId: string,
  metodo: 'FABRICK' | 'STRIPE',
): Promise<{ session_id: string; redirect_url: string; importi: { importo_netto: number; importo_iva: number; importo_totale: number } }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });

  if (!contratto) throw new Error('Contratto non trovato');

  const importi = calcolaImporti(Number(contratto.pricing_riacquisto), Number(contratto.margine_lordo));
  const provider = metodo === 'FABRICK' ? fabrickProvider : stripeProvider;

  const session = await provider.initiatePayment(importi.importo_totale, 'EUR', {
    contratto_eol_id: contratto.id,
    cliente_ragione_sociale: contratto.cliente.ragione_sociale,
    contratto_nsm_id: contratto.contratto_nsm_id,
  });

  await prisma.pagamento.create({
    data: {
      contratto_eol_id: contrattoEolId,
      importo_netto: new Prisma.Decimal(importi.importo_netto),
      importo_iva: new Prisma.Decimal(importi.importo_iva),
      importo_totale: new Prisma.Decimal(importi.importo_totale),
      metodo,
      stato: 'INIZIATO',
      session_id: session.session_id,
      natura_giuridica: 'ACCONTO',
    },
  });

  await registraEvento(contrattoEolId, 'CLIENTE', contratto.cliente_id, 'PAGAMENTO_INIZIATO', {
    metodo,
    session_id: session.session_id,
    importo_totale: importi.importo_totale,
  });

  return { session_id: session.session_id, redirect_url: session.redirect_url, importi };
}

// --- Bonifico bancario manuale ---
// Il cliente vede l'IBAN nella mascherina di pagamento, esegue il bonifico
// dalla propria banca e lo dichiara nell'app; il backoffice verifica l'accredito
// e lo registra con confermaBonificoRicevuto. I provider online (Fabrick/Stripe)
// restano nel codice, disattivati dal flag flags.abilita_pagamento_online.

export async function dichiaraBonifico(contrattoEolId: string): Promise<{
  pagamento_id: string;
  gia_dichiarato: boolean;
  importi: { importo_netto: number; importo_iva: number; importo_totale: number };
}> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });
  if (!contratto) throw new Error('Contratto non trovato');

  const importi = calcolaImporti(Number(contratto.pricing_riacquisto), Number(contratto.margine_lordo));

  // Idempotenza: una sola dichiarazione di bonifico attiva per pratica
  const esistente = await prisma.pagamento.findFirst({
    where: {
      contratto_eol_id: contrattoEolId,
      metodo: 'BONIFICO',
      stato: { in: ['DICHIARATO', 'COMPLETATO'] },
    },
  });
  if (esistente) {
    return { pagamento_id: esistente.id, gia_dichiarato: true, importi };
  }

  const pagamento = await prisma.pagamento.create({
    data: {
      contratto_eol_id: contrattoEolId,
      importo_netto: new Prisma.Decimal(importi.importo_netto),
      importo_iva: new Prisma.Decimal(importi.importo_iva),
      importo_totale: new Prisma.Decimal(importi.importo_totale),
      metodo: 'BONIFICO',
      stato: 'DICHIARATO',
      natura_giuridica: 'ACCONTO',
    },
  });

  await registraEvento(contrattoEolId, 'CLIENTE', contratto.cliente_id, 'BONIFICO_DICHIARATO', {
    pagamento_id: pagamento.id,
    importo_totale: importi.importo_totale,
  });

  return { pagamento_id: pagamento.id, gia_dichiarato: false, importi };
}

export async function confermaBonificoRicevuto(
  contrattoEolId: string,
  utenteId: string,
  riferimento?: string,
): Promise<{ pagamento_id: string; fattura_path: string; fattura_numero: string }> {
  const contratto = await prisma.contratto_EOL.findUnique({
    where: { id: contrattoEolId },
    include: { cliente: true },
  });
  if (!contratto) throw new Error('Contratto non trovato');
  if (contratto.stato === 'RIACQUISTO_PAGATO') throw new Error('Pratica già pagata');

  // Se il cliente non ha dichiarato il bonifico nell'app (ha pagato e basta),
  // il pagamento viene creato al volo al momento della registrazione.
  let pagamento = await prisma.pagamento.findFirst({
    where: { contratto_eol_id: contrattoEolId, metodo: 'BONIFICO', stato: 'DICHIARATO' },
  });
  if (!pagamento) {
    const importi = calcolaImporti(Number(contratto.pricing_riacquisto), Number(contratto.margine_lordo));
    pagamento = await prisma.pagamento.create({
      data: {
        contratto_eol_id: contrattoEolId,
        importo_netto: new Prisma.Decimal(importi.importo_netto),
        importo_iva: new Prisma.Decimal(importi.importo_iva),
        importo_totale: new Prisma.Decimal(importi.importo_totale),
        metodo: 'BONIFICO',
        stato: 'DICHIARATO',
        natura_giuridica: 'ACCONTO',
      },
    });
  }

  const fattura = await generaRicevutaPagamento(pagamento.id);

  await prisma.$transaction([
    prisma.pagamento.update({
      where: { id: pagamento.id },
      data: {
        stato: 'COMPLETATO',
        data_completato: new Date(),
        riferimento_transazione: riferimento || null,
      },
    }),
    prisma.contratto_EOL.update({
      where: { id: contrattoEolId },
      data: { stato: 'RIACQUISTO_PAGATO' },
    }),
  ]);

  await registraEvento(contrattoEolId, 'BACKOFFICE', utenteId, 'PAGAMENTO_COMPLETATO', {
    pagamento_id: pagamento.id,
    metodo: 'BONIFICO',
    importo_totale: Number(pagamento.importo_totale),
    riferimento_transazione: riferimento || null,
  });

  return { pagamento_id: pagamento.id, fattura_path: fattura.pdfPath, fattura_numero: fattura.fatturaNumero };
}

export async function verifyPayment(sessionId: string): Promise<{
  stato: string;
  transaction_id?: string;
}> {
  const pagamento = await prisma.pagamento.findUnique({ where: { session_id: sessionId } });
  if (!pagamento) throw new Error('Pagamento non trovato');

  return {
    stato: pagamento.stato,
    transaction_id: pagamento.riferimento_transazione || undefined,
  };
}

export async function handlePaymentCallback(
  sessionId: string,
  esito: 'success' | 'failure',
  provider: 'FABRICK' | 'STRIPE',
): Promise<{ stato: string; fattura_path?: string }> {
  const pagamento = await prisma.pagamento.findUnique({
    where: { session_id: sessionId },
    include: { contratto_eol: { include: { cliente: true } } },
  });

  if (!pagamento) throw new Error('Pagamento non trovato');

  // Idempotenza: se gia completato o fallito, non riprocessare
  if (pagamento.stato === 'COMPLETATO' || pagamento.stato === 'FALLITO') {
    return {
      stato: pagamento.stato,
      fattura_path: pagamento.fattura_path || undefined,
    };
  }

  const providerInstance = provider === 'FABRICK' ? fabrickProvider : stripeProvider;
  // simulateOutcome esiste solo nei mock: con Stripe reale l'esito arriva dal
  // webhook firmato e non va (ne' puo') essere forzato da qui.
  if ('simulateOutcome' in providerInstance) {
    (providerInstance as { simulateOutcome(id: string, ok: boolean): void }).simulateOutcome(sessionId, esito === 'success');
  }

  if (esito === 'success') {
    const providerStatus = await providerInstance.verifyPayment(sessionId);

    const fattura = await generaRicevutaPagamento(pagamento.id);

    await prisma.$transaction([
      prisma.pagamento.update({
        where: { session_id: sessionId },
        data: {
          stato: 'COMPLETATO',
          data_completato: new Date(),
          riferimento_transazione: providerStatus.transaction_id || null,
        },
      }),
      prisma.contratto_EOL.update({
        where: { id: pagamento.contratto_eol_id },
        data: { stato: 'RIACQUISTO_PAGATO' },
      }),
    ]);

    await registraEvento(pagamento.contratto_eol_id, 'SISTEMA', provider, 'PAGAMENTO_COMPLETATO', {
      session_id: sessionId,
      importo_totale: Number(pagamento.importo_totale),
      riferimento_transazione: providerStatus.transaction_id || null,
    });

    return { stato: 'COMPLETATO', fattura_path: fattura.pdfPath };
  } else {
    await prisma.pagamento.update({
      where: { session_id: sessionId },
      data: { stato: 'FALLITO' },
    });

    await registraEvento(pagamento.contratto_eol_id, 'SISTEMA', provider, 'PAGAMENTO_FALLITO', {
      session_id: sessionId,
    });

    return { stato: 'FALLITO' };
  }
}
