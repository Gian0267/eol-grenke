import crypto from 'crypto';
import {
  PaymentProvider,
  PaymentMetadata,
  PaymentSession,
  PaymentStatus,
  RefundResult,
} from './types.js';

const sessions = new Map<string, { stato: 'PENDING' | 'COMPLETED' | 'FAILED'; transaction_id?: string }>();

export class MockStripeProvider implements PaymentProvider {
  async initiatePayment(
    amount: number,
    currency: string,
    metadata: PaymentMetadata,
  ): Promise<PaymentSession> {
    const session_id = `stripe_${crypto.randomUUID()}`;
    sessions.set(session_id, { stato: 'PENDING' });

    console.log(`[Stripe MOCK] Pagamento iniziato: ${session_id} — ${currency} ${amount} per ${metadata.contratto_nsm_id}`);

    return {
      session_id,
      redirect_url: `/pagamento/stripe/${session_id}`,
      provider: 'STRIPE',
      stato: 'PENDING',
    };
  }

  async verifyPayment(sessionId: string): Promise<PaymentStatus> {
    const session = sessions.get(sessionId);
    if (!session) {
      return { session_id: sessionId, stato: 'FAILED', error_message: 'Sessione non trovata' };
    }
    return {
      session_id: sessionId,
      stato: session.stato,
      transaction_id: session.transaction_id,
    };
  }

  async refundPayment(transactionId: string, amount: number): Promise<RefundResult> {
    console.log(`[Stripe MOCK] Rimborso: ${transactionId} — EUR ${amount}`);
    return { success: true, refund_id: `stripe_ref_${crypto.randomUUID()}` };
  }

  simulateOutcome(sessionId: string, success: boolean): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.stato = success ? 'COMPLETED' : 'FAILED';
    session.transaction_id = success ? `stripe_txn_${crypto.randomUUID()}` : undefined;
    console.log(`[Stripe MOCK] Esito simulato: ${sessionId} → ${session.stato}`);
  }
}
