import dotenv from 'dotenv';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import backofficeRoutes from './routes/backoffice.routes.js';
import backofficeDashboardRoutes from './routes/backoffice-dashboard.routes.js';
import backofficeAdvancedRoutes from './routes/backoffice-advanced.routes.js';
import clientRoutes from './routes/client.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import authRoutes from './routes/auth.routes.js';
import { handlePaymentCallback } from './services/payment.service.js';
import { startSchedulerCron, runScheduler } from './services/scheduler.service.js';
import adminRoutes from './routes/admin.routes.js';
import impostazioniRoutes from './routes/impostazioni.routes.js';

const app = express();
const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3001);

// Dietro il reverse proxy di Hostinger (LiteSpeed) la connessione arriva come HTTP
// ma l'utente è su HTTPS. 'trust proxy' fa sì che Express riconosca la connessione
// come sicura (via X-Forwarded-Proto) così express-session imposta il cookie Secure.
app.set('trust proxy', 1);

if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET non configurato');
  process.exit(1);
}

// TODO produzione: sostituire origin:true con whitelist esplicita es. ['https://app.example.com']
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend OK' });
});

app.use('/api/backoffice/auth', authRoutes);
app.use('/api/backoffice', backofficeRoutes);
app.use('/api/backoffice/dashboard', backofficeDashboardRoutes);
app.use('/api/backoffice', backofficeAdvancedRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/backoffice/impostazioni', impostazioniRoutes);
app.use('/api/clienti', clientRoutes);
app.use('/api/cliente', clienteRoutes);

// Callback pagamenti mock (rotta pubblica, chiamata dal "provider")
app.post('/api/pagamenti/callback/:provider/:session_id', async (req, res) => {
  try {
    const { provider, session_id } = req.params;
    const { esito } = req.body as { esito: 'success' | 'failure' };

    if (!['FABRICK', 'STRIPE'].includes(provider.toUpperCase())) {
      res.status(400).json({ errore: 'Provider non valido' });
      return;
    }
    if (!['success', 'failure'].includes(esito)) {
      res.status(400).json({ errore: 'Esito non valido' });
      return;
    }

    const result = await handlePaymentCallback(
      session_id,
      esito,
      provider.toUpperCase() as 'FABRICK' | 'STRIPE',
    );

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[callback pagamento] Errore:', err);
    res.status(500).json({ errore: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// Trigger dello scheduler da cron esterno (per hosting che sospende l'app quando inattiva).
// GET /api/admin/run-scheduler?secret=...  — protetto da SCHEDULER_TRIGGER_SECRET
app.get('/api/admin/run-scheduler', async (req, res) => {
  const expected = process.env.SCHEDULER_TRIGGER_SECRET;
  if (!expected) {
    res.status(503).json({ errore: 'SCHEDULER_TRIGGER_SECRET non configurato' });
    return;
  }
  if (req.query.secret !== expected) {
    res.status(401).json({ errore: 'Secret non valido' });
    return;
  }
  try {
    const report = await runScheduler();
    res.json({ ok: true, report });
  } catch (err) {
    console.error('[run-scheduler] Errore:', err);
    res.status(500).json({ errore: err instanceof Error ? err.message : 'Errore interno' });
  }
});

// In produzione il backend serve anche il frontend buildato (single deploy, stesso
// origine → niente CORS, le chiamate relative /api restano sullo stesso host).
if (process.env.NODE_ENV === 'production') {
  const frontendDist = process.env.FRONTEND_DIST || resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  // SPA fallback: ogni GET non-API restituisce index.html (routing lato client)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(resolve(frontendDist, 'index.html'));
    } else {
      next();
    }
  });
  console.log(`[Frontend] Servito staticamente da ${frontendDist}`);
}

// Avvio: socket LiteSpeed (Hostinger) se presente, altrimenti porta TCP.
const socket = process.env.LSNODE_SOCKET;
function onListen() {
  console.log(`NSM EOL Backend in ascolto${socket ? ` su socket ${socket}` : ` su porta ${port}`}`);
  startSchedulerCron();
}
if (socket) {
  try {
    if (fs.existsSync(socket)) fs.unlinkSync(socket);
  } catch (e) {
    console.log('[socket] cleanup:', e);
  }
  app.listen(socket, onListen);
} else {
  app.listen(port, onListen);
}
