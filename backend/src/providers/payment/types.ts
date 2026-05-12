export interface PaymentMetadata {
  contratto_eol_id: string;
  cliente_ragione_sociale: string;
  contratto_nsm_id: string;
}

export interface PaymentSession {
  session_id: string;
  redirect_url: string;
  provider: 'FABRICK' | 'STRIPE';
  stato: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface PaymentStatus {
  session_id: string;
  stato: 'PENDING' | 'COMPLETED' | 'FAILED';
  transaction_id?: string;
  error_message?: string;
}

export interface RefundResult {
  success: boolean;
  refund_id?: string;
  error_message?: string;
}

export interface PaymentProvider {
  initiatePayment(
    amount: number,
    currency: string,
    metadata: PaymentMetadata,
  ): Promise<PaymentSession>;

  verifyPayment(sessionId: string): Promise<PaymentStatus>;

  refundPayment(
    transactionId: string,
    amount: number,
  ): Promise<RefundResult>;
}
