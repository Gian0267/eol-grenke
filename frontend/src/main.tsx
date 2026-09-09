import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { installSessionGuard } from './lib/session-guard'

installSessionGuard()

// Simulazione temi (solo in sviluppo): ?tema=sito | sito-sobrio | classico.
// La scelta resta in localStorage, così si può navigare l'app senza ripetere
// il parametro. In produzione questo blocco non viene incluso nel bundle.
if (import.meta.env.DEV) {
  const richiesto = new URLSearchParams(window.location.search).get('tema')
  if (richiesto) localStorage.setItem('nsm_tema', richiesto)
  const tema = localStorage.getItem('nsm_tema')
  if (tema === 'classico') document.documentElement.setAttribute('data-tema', 'classico')
  else document.documentElement.removeAttribute('data-tema')
  console.info(`[tema] attivo: ${tema ?? 'sito'} — ?tema=classico per il precedente, ?tema=sito per tornare`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
