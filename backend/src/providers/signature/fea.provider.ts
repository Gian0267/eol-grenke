import crypto from 'crypto';

export interface SignerInfo {
  nome: string;
  ip: string;
  userAgent: string;
  otpVerificato: boolean;
}

export interface SignatureSession {
  sessionId: string;
  hash: string;
  timestamp: string;
}

export interface SignatureStatus {
  sessionId: string;
  stato: 'FIRMATO' | 'IN_ATTESA' | 'ERRORE';
  hash: string;
}

export interface SignatureProvider {
  requestSignature(documentPath: string, signer: SignerInfo): Promise<SignatureSession>;
  verifySignature(sessionId: string): Promise<SignatureStatus>;
  getSignedDocument(sessionId: string): Promise<Buffer>;
}

export class MockFeaProvider implements SignatureProvider {
  private sessions = new Map<string, { documentPath: string; signer: SignerInfo; hash: string; timestamp: string }>();

  async requestSignature(documentPath: string, signer: SignerInfo): Promise<SignatureSession> {
    const { readFileSync } = await import('fs');
    const fileBuffer = readFileSync(documentPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    this.sessions.set(sessionId, { documentPath, signer, hash, timestamp });

    console.log(`[FEA-MOCK] Firma richiesta: session=${sessionId}, hash=${hash.substring(0, 16)}...`);

    return { sessionId, hash, timestamp };
  }

  async verifySignature(sessionId: string): Promise<SignatureStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { sessionId, stato: 'ERRORE', hash: '' };
    }
    return { sessionId, stato: 'FIRMATO', hash: session.hash };
  }

  async getSignedDocument(sessionId: string): Promise<Buffer> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Sessione di firma non trovata');
    const { readFileSync } = await import('fs');
    return readFileSync(session.documentPath);
  }
}
