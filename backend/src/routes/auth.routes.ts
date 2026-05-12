import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/db.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { errore: 'Troppi tentativi di login, riprova tra 15 minuti' },
});

// Passport local strategy
passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const utente = await prisma.utente_NSM.findUnique({ where: { email } });
        if (!utente) return done(null, false, { message: 'Email non trovata' });
        if (!utente.attivo) return done(null, false, { message: 'Utente disattivato' });

        const match = await bcrypt.compare(password, utente.password);
        if (!match) return done(null, false, { message: 'Password non valida' });

        return done(null, {
          id: utente.id,
          nome: utente.nome,
          cognome: utente.cognome,
          email: utente.email,
          ruolo: utente.ruolo,
        });
      } catch (err) {
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const utente = await prisma.utente_NSM.findUnique({ where: { id } });
    if (!utente || !utente.attivo) return done(null, false);
    done(null, {
      id: utente.id,
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      ruolo: utente.ruolo,
    });
  } catch (err) {
    done(err);
  }
});

// POST /api/backoffice/auth/login
router.post('/login', loginLimiter, (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ errore: info?.message || 'Credenziali non valide' });
      return;
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ success: true, utente: user });
    });
  })(req, res, next);
});

// POST /api/backoffice/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ errore: 'Errore durante il logout' });
      return;
    }
    res.json({ success: true });
  });
});

// GET /api/backoffice/auth/me
router.get('/me', (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ errore: 'Non autenticato' });
    return;
  }
  res.json({ utente: req.user });
});

// Middleware: requireAuth
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ errore: 'Autenticazione richiesta' });
}

// Middleware: requireRole
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ errore: 'Autenticazione richiesta' });
      return;
    }
    const user = req.user as { ruolo: string };
    if (!roles.includes(user.ruolo)) {
      res.status(403).json({ errore: 'Ruolo non autorizzato' });
      return;
    }
    next();
  };
}

export default router;
