import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/db.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    nome: string;
    cognome: string;
    email: string;
    ruolo: string;
  };
}

const RUOLI_BACKOFFICE = ['AGENTE', 'JUNIOR_AGENT', 'CAPO_AREA', 'GROUP_MANAGER', 'AGENZIA', 'BACKOFFICE_INTERNO', 'ADMIN'];

export async function verifyBackofficeToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Accept passport session auth
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  if (process.env.NODE_ENV === 'production') {
    res.status(401).json({ error: 'Sessione non valida' });
    return;
  }

  const userId = req.headers['x-user-id'] as string | undefined;

  if (!userId) {
    res.status(401).json({ error: 'Header x-user-id mancante' });
    return;
  }

  const utente = await prisma.utente_NSM.findUnique({ where: { id: userId } });

  if (!utente) {
    res.status(401).json({ error: 'Utente non trovato' });
    return;
  }

  if (!utente.attivo) {
    res.status(403).json({ error: 'Utente disattivato' });
    return;
  }

  if (!RUOLI_BACKOFFICE.includes(utente.ruolo)) {
    res.status(403).json({ error: 'Ruolo non autorizzato per il backoffice' });
    return;
  }

  req.user = {
    id: utente.id,
    nome: utente.nome,
    cognome: utente.cognome,
    email: utente.email,
    ruolo: utente.ruolo,
  };

  next();
}
