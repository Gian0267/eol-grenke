import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

router.get('/opt-out', async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).send(optOutPage('Link non valido.', false));
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { cliente_id: string; action: string };

    if (payload.action !== 'opt-out') {
      res.status(400).send(optOutPage('Token non valido per questa operazione.', false));
      return;
    }

    await prisma.cliente.update({
      where: { id: payload.cliente_id },
      data: { opt_out_comunicazioni: true },
    });

    res.send(optOutPage('La Sua richiesta è stata registrata. Non riceverà più comunicazioni da parte nostra.', true));
  } catch (err) {
    console.error('[opt-out] Errore:', err);
    res.status(400).send(optOutPage('Il link non è valido o è scaduto.', false));
  }
});

function optOutPage(message: string, success: boolean): string {
  const color = success ? '#16a34a' : '#dc2626';
  const icon = success ? '&#x2705;' : '&#x274C;';
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opt-out comunicazioni</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
<div style="background:#fff;padding:40px;border-radius:8px;max-width:500px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<p style="font-size:48px;margin:0 0 16px;">${icon}</p>
<h1 style="color:#1a3a52;font-size:20px;margin:0 0 12px;">Comunicazioni Noleggio Su Misura</h1>
<p style="color:${color};font-size:16px;line-height:1.5;">${message}</p>
<p style="color:#94a3b8;font-size:13px;margin-top:24px;">Smartcom Solutions Srl — 011 4557949</p>
</div></body></html>`;
}

export default router;
