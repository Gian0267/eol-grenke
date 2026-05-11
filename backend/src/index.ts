import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import backofficeRoutes from './routes/backoffice.routes.js';

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 3001);
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend OK' });
});

app.use('/api/backoffice', backofficeRoutes);

app.listen(port, () => {
  console.log(`NSM EOL Backend listening on port ${port}`);
});
