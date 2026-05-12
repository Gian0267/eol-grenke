import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import backofficeRoutes from './routes/backoffice.routes.js';
import backofficeDashboardRoutes from './routes/backoffice-dashboard.routes.js';
import backofficeAdvancedRoutes from './routes/backoffice-advanced.routes.js';
import clientRoutes from './routes/client.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import authRoutes from './routes/auth.routes.js';
import { handlePaymentCallback } from './services/payment.service.js';
import { startSchedulerCron } from './services/scheduler.service.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();
const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3001);
const prisma = new PrismaClient();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'nsm-eol-dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
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

app.listen(port, () => {
  console.log(`NSM EOL Backend listening on port ${port}`);
  startSchedulerCron();
});
