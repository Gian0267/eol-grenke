import { prisma } from '../lib/db.js';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  valore: string;
  tipo: string;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

async function getRaw(chiave: string): Promise<CacheEntry | null> {
  const cached = cache.get(chiave);
  if (cached && cached.expires > Date.now()) return cached;

  const imp = await prisma.impostazione.findUnique({ where: { chiave } });
  if (!imp) return null;

  const entry: CacheEntry = {
    valore: imp.valore,
    tipo: imp.tipo,
    expires: Date.now() + CACHE_TTL_MS,
  };
  cache.set(chiave, entry);
  return entry;
}

export async function getNumero(chiave: string, fallback?: number): Promise<number> {
  const entry = await getRaw(chiave);
  if (!entry) return fallback ?? 0;
  const n = parseFloat(entry.valore);
  return isNaN(n) ? (fallback ?? 0) : n;
}

export async function getTesto(chiave: string, fallback?: string): Promise<string> {
  const entry = await getRaw(chiave);
  return entry?.valore ?? fallback ?? '';
}

export async function getBooleano(chiave: string, fallback?: boolean): Promise<boolean> {
  const entry = await getRaw(chiave);
  if (!entry) return fallback ?? false;
  return entry.valore === 'true';
}

export async function getJson<T = unknown>(chiave: string, fallback?: T): Promise<T> {
  const entry = await getRaw(chiave);
  if (!entry) return fallback as T;
  try {
    return JSON.parse(entry.valore) as T;
  } catch {
    return fallback as T;
  }
}

export async function getHtml(chiave: string, fallback?: string): Promise<string> {
  const entry = await getRaw(chiave);
  return entry?.valore ?? fallback ?? '';
}

export function invalidateCache(chiave?: string) {
  if (chiave) {
    cache.delete(chiave);
  } else {
    cache.clear();
  }
}
