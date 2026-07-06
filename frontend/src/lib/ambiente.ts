// Vista Test/Live del backoffice: per utente, persistita nel browser.
// Il backend riceve la scelta nell'header `x-ambiente` e la onora solo per
// ADMIN e BACKOFFICE_INTERNO (gli altri ruoli vedono sempre LIVE).

const STORAGE_KEY = 'nsm_ambiente';

export type Ambiente = 'TEST' | 'LIVE';

const RUOLI_VISTA_TEST = ['ADMIN', 'BACKOFFICE_INTERNO'];

export function puoVedereTest(ruolo?: string | null): boolean {
  return RUOLI_VISTA_TEST.includes(ruolo || '');
}

export function getAmbiente(): Ambiente {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'TEST' ? 'TEST' : 'LIVE';
  } catch {
    return 'LIVE';
  }
}

export function setAmbiente(ambiente: Ambiente): void {
  try {
    localStorage.setItem(STORAGE_KEY, ambiente);
  } catch { /* storage non disponibile */ }
}

export function isTest(): boolean {
  return getAmbiente() === 'TEST';
}
