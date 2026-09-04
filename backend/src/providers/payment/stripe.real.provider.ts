/**
 * Provider Stripe reale, basato su Checkout Session.
 *
 * I dati della carta non transitano mai dai nostri server: creiamo una sessione
 * e mandiamo il cliente sulla pagina ospitata da Stripe. La conferma NON arriva
 * dal ritorno del browser (il cliente potrebbe chiudere la scheda a pagamento
 * avvenuto): arriva dal webhook checkout.session.completed, che e' l'unica
 * fonte attendibile dell'incasso.
 *
 * Il session_id salvato su Pagamento e' l'id della Checkout Session (cs_...),
 * cosi' il webhook ritrova la pratica senza tabelle di appoggio.
 */
import Stripe from 'stripe';
import {
  PaymentProvider,
  PaymentMetadata,
  PaymentSession,
  PaymentStatus,
  RefundResult,
} from './types.js';

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe;
  private frontendUrl: string;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  }

  async initiatePayment(
    amount: number,
    currency: string,
    metadata: PaymentMetadata,
  ): Promise<PaymentSession> {
    // Stripe lavora in centesimi: arrotondiamo per non perdere mezzi centesimi
    // su importi con IVA a margine.
    const importoCent = Math.round(amount * 100);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: importoCent,
          product_data: {
            name: `Riacquisto beni — contratto ${metadata.contratto_nsm_id}`,
            description: metadata.cliente_ragione_sociale,
          },
        },
      }],
      // Il cliente torna qui, ma lo stato della pratica lo decide il webhook.
      success_url: `${this.frontendUrl}/pagamento/esito?stato=ok`,
      cancel_url: `${this.frontendUrl}/pagamento/esito?stato=annullato`,
      metadata: {
        contratto_eol_id: metadata.contratto_eol_id,
        contratto_nsm_id: metadata.contratto_nsm_id,
      },
    });

    if (!session.url) throw new Error('Stripe non ha restituito un URL di pagamento');

    console.log(`[Stripe] Checkout creata: ${session.id} — EUR ${amount} per ${metadata.contratto_nsm_id}`);

    return {
      session_id: session.id,
      redirect_url: session.url,
      provider: 'STRIPE',
      stato: 'PENDING',
    };
  }

  async verifyPayment(sessionId: string): Promise<PaymentStatus> {
    try {
      const s = await this.stripe.checkout.sessions.retrieve(sessionId);
      // payment_status e' 'paid' solo a incasso avvenuto; 'unpaid' copre sia la
      // sessione ancora aperta sia quella scaduta.
      const stato = s.payment_status === 'paid'
        ? 'COMPLETED'
        : s.status === 'expired' ? 'FAILED' : 'PENDING';
      return {
        session_id: sessionId,
        stato,
        transaction_id: typeof s.payment_intent === 'string'
          ? s.payment_intent
          : s.payment_intent?.id,
      };
    } catch (err) {
      return {
        session_id: sessionId,
        stato: 'FAILED',
        error_message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async refundPayment(transactionId: string, amount: number): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: Math.round(amount * 100),
      });
      return { success: true, refund_id: refund.id };
    } catch (err) {
      return {
        success: false,
        error_message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Verifica la firma del webhook: senza, chiunque potrebbe fingere un incasso. */
  costruisciEvento(payload: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
