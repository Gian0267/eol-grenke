import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 3001);
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend OK' });
});

app.listen(port, () => {
  console.log(`NSM EOL Backend listening on port ${port}`);
});
