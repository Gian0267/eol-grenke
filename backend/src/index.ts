import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import backofficeRoutes from './routes/backoffice.routes.js';
import clientRoutes from './routes/client.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import { handlePaymentCallback } from './services/payment.service.js';

const app = express();
const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 3001);
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend OK' });
});

app.use('/api/backoffice', backofficeRoutes);
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
});
