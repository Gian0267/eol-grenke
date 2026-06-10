import { Router, Response } from 'express';
import Handlebars from 'handlebars';
import sanitizeHtml from 'sanitize-html';
import { verifyBackofficeToken, AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as impostazioniService from '../services/impostazioni.service.js';
import { invalidateCache } from '../services/config.service.js';

const router = Router();

router.use(verifyBackofficeToken as any);

function requireAdmin(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (req.user?.ruolo !== 'ADMIN') {
    res.status(403).json({ errore: 'Solo gli ADMIN possono gestire le impostazioni' });
    return;
  }
  next();
}

router.use(requireAdmin as any);

// GET /api/backoffice/impostazioni — tutte raggruppate per categoria
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const grouped = await impostazioniService.getAll();
    res.json(grouped);
  } catch (err) {
    console.error('[Impostazioni] Errore GET all:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// GET /api/backoffice/impostazioni/preview-email/:chiave — anteprima email
router.get('/preview-email/:chiave', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chiave = `email.${req.params.chiave}`;
    const imp = await impostazioniService.get(chiave);
    if (!imp || imp.tipo !== 'HTML') {
      res.status(404).json({ errore: 'Template email non trovato' });
      return;
    }

    const datiPreview = {
      ragione_sociale: 'Acme SRL (Anteprima)',
      numero_contratto_nsm: 'NSM-2024-DEMO',
      numero_contratto_grenke: 'G-FLEX-24-DEMO',
      data_scadenza: '31/12/2026',
      beni: 'Notebook Lenovo ThinkPad X1 Carbon, Monitor LG 27"',
      monte_canoni: '3.060,00',
      pricing_riacquisto: '244,80',
      valore_gift_card: '75,00',
      link_area_cliente: '#anteprima',
      deadline_decisione: '01/12/2026',
      link_opt_out: '#anteprima-optout',
      nome_agente: 'Mario Rossi',
      referente_nome: 'Giuseppe Bianchi',
      telefono: '011 1234567',
      email_cliente: 'demo@acme.it',
    };

    const compiled = Handlebars.compile(imp.valore);
    const html = compiled(datiPreview);
    res.json({ html });
  } catch (err) {
    console.error('[Impostazioni] Errore preview email:', err);
    res.status(500).json({ errore: 'Errore rendering anteprima' });
  }
});

// GET /api/backoffice/impostazioni/:categoria — sezione specifica
router.get('/:categoria', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categoria = (req.params.categoria as string).toUpperCase();
    const list = await impostazioniService.getCategoria(categoria);
    res.json(list);
  } catch (err) {
    console.error('[Impostazioni] Errore GET categoria:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// PUT /api/backoffice/impostazioni/:chiave — aggiorna valore
router.put('/:chiave', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chiave = req.params.chiave as string;
    const { valore } = req.body as { valore: string };

    if (valore === undefined || valore === null) {
      res.status(400).json({ errore: 'Campo "valore" obbligatorio' });
      return;
    }

    const imp = await impostazioniService.get(chiave);
    if (!imp) {
      res.status(404).json({ errore: 'Chiave non trovata' });
      return;
    }

    let valoreValidato = String(valore);

    switch (imp.tipo) {
      case 'NUMERO': {
        const n = parseFloat(valoreValidato);
        if (isNaN(n)) {
          res.status(400).json({ errore: 'Il valore deve essere un numero' });
          return;
        }
        valoreValidato = String(n);
        break;
      }
      case 'BOOLEANO':
        if (valoreValidato !== 'true' && valoreValidato !== 'false') {
          res.status(400).json({ errore: 'Il valore deve essere "true" o "false"' });
          return;
        }
        break;
      case 'JSON':
        try {
          JSON.parse(valoreValidato);
        } catch {
          res.status(400).json({ errore: 'Il valore deve essere JSON valido' });
          return;
        }
        break;
      case 'HTML':
        valoreValidato = sanitizeHtml(valoreValidato, {
          allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'ul', 'ol', 'li',
            'a', 'b', 'strong', 'i', 'em', 'u', 'span', 'div', 'table', 'thead', 'tbody',
            'tr', 'th', 'td', 'img', 'blockquote', 'pre', 'code', 'center'],
          allowedAttributes: {
            '*': ['style', 'class', 'align', 'valign'],
            'a': ['href', 'target'],
            'img': ['src', 'alt', 'width', 'height'],
            'table': ['border', 'cellpadding', 'cellspacing', 'bgcolor', 'width'],
            'td': ['width', 'bgcolor'],
            'th': ['width', 'bgcolor'],
          },
        });
        break;
    }

    const result = await impostazioniService.set(chiave, valoreValidato, req.user!.id);
    if (!result.success) {
      res.status(400).json({ errore: result.errore });
      return;
    }

    invalidateCache(chiave);
    res.json({ success: true });
  } catch (err) {
    console.error('[Impostazioni] Errore PUT:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// POST /api/backoffice/impostazioni/:chiave/reset — ripristina default singolo
router.post('/:chiave/reset', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chiave = req.params.chiave as string;
    const result = await impostazioniService.resetDefault(chiave, req.user!.id);
    if (!result.success) {
      res.status(400).json({ errore: result.errore });
      return;
    }
    invalidateCache(chiave);
    res.json({ success: true });
  } catch (err) {
    console.error('[Impostazioni] Errore reset:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

// POST /api/backoffice/impostazioni/reset-all — ripristina tutti i default
router.post('/reset-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conferma } = req.body as { conferma?: boolean };
    if (!conferma) {
      res.status(400).json({ errore: 'Richiesta conferma: inviare { "conferma": true }' });
      return;
    }
    const count = await impostazioniService.resetAllDefault(req.user!.id);
    invalidateCache();
    res.json({ success: true, impostazioni_ripristinate: count });
  } catch (err) {
    console.error('[Impostazioni] Errore reset-all:', err);
    res.status(500).json({ errore: 'Errore interno' });
  }
});

export default router;
