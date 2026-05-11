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

app.listen(port, () => {
  console.log(`NSM EOL Backend listening on port ${port}`);
});
