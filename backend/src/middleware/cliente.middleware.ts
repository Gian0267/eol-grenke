import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export interface ClienteAuthenticatedRequest extends Request {
  contrattoEolId?: string;
  clienteId?: string;
}

export function verifyClienteToken(
  req: ClienteAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ codice: 'TOKEN_NON_VALIDO', messaggio: 'Token mancante' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      contratto_eol_id: string;
      cliente_id: string;
    };

    req.contrattoEolId = payload.contratto_eol_id;
    req.clienteId = payload.cliente_id;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ codice: 'TOKEN_SCADUTO', messaggio: 'Il token è scaduto' });
      return;
    }
    res.status(401).json({ codice: 'TOKEN_NON_VALIDO', messaggio: 'Token non valido' });
  }
}
