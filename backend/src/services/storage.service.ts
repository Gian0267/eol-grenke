import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

/**
 * Servizio di storage documenti (PDF/allegati).
 *
 * Due modalità, scelte automaticamente in base alle variabili d'ambiente:
 *  - Supabase Storage  → se SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sono presenti.
 *                        Il riferimento salvato nel DB è "supabase:<chiave>".
 *  - Disco locale      → fallback. Il riferimento salvato nel DB è il path assoluto.
 *
 * loadDocument() riconosce automaticamente il tipo di riferimento, quindi i
 * vecchi documenti salvati su disco continuano a funzionare anche dopo il
 * passaggio a Supabase.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = resolve(__dirname, '../../storage/pdfs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documenti';

const SUPABASE_PREFIX = 'supabase:';

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log(`[Storage] Modalità Supabase Storage attiva (bucket: ${BUCKET})`);
} else {
  console.log('[Storage] Modalità disco locale (Supabase non configurato)');
}

/**
 * Salva un documento e restituisce il riferimento da memorizzare nel DB.
 * @param buffer    contenuto del file
 * @param filename  nome file (es. "verbale_restituzione_xxx.pdf")
 * @param contentType MIME type (default application/pdf)
 */
export async function saveDocument(
  buffer: Buffer,
  filename: string,
  contentType = 'application/pdf',
): Promise<string> {
  if (supabase) {
    const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
      contentType,
      upsert: true,
    });
    if (error) {
      throw new Error(`[Storage] Upload su Supabase fallito (${filename}): ${error.message}`);
    }
    return `${SUPABASE_PREFIX}${filename}`;
  }

  // Fallback locale
  if (!existsSync(LOCAL_DIR)) mkdirSync(LOCAL_DIR, { recursive: true });
  const path = resolve(LOCAL_DIR, filename);
  writeFileSync(path, buffer);
  return path;
}

/**
 * Carica un documento dato il riferimento memorizzato nel DB.
 * Riconosce sia i riferimenti Supabase ("supabase:<chiave>") sia i path locali.
 */
export async function loadDocument(ref: string): Promise<Buffer> {
  if (ref.startsWith(SUPABASE_PREFIX)) {
    if (!supabase) {
      throw new Error('[Storage] Documento su Supabase ma client non configurato');
    }
    const key = ref.slice(SUPABASE_PREFIX.length);
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) {
      throw new Error(`[Storage] Download da Supabase fallito (${key}): ${error?.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  // Path locale (assoluto) — retrocompatibilità con documenti pre-Supabase
  if (isAbsolute(ref)) {
    return readFileSync(ref);
  }

  // Nome file relativo → cerca nella cartella locale
  return readFileSync(resolve(LOCAL_DIR, ref));
}

/** True se lo storage Supabase è configurato e attivo. */
export function isSupabaseStorage(): boolean {
  return supabase !== null;
}
