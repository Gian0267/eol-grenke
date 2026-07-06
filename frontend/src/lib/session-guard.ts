// Intercettore globale delle risposte API: quando una chiamata del backoffice
// riceve 401 (sessione scaduta o invalidata da un riavvio del server), pulisce
// l'utente salvato e riporta al login, invece di lasciare le pagine con un
// errore generico "Errore nel caricamento dei dati".
//
// Non tocca l'area cliente (/pratica/:token, autenticata via JWT nel link) né
// la pagina di login stessa (dove il 401 significa "credenziali sbagliate").

import { getAmbiente } from './ambiente'

const LOGIN_PATH = '/backoffice/login'

let redirecting = false

function pathnameOf(input: RequestInfo | URL): string {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return new URL(url, window.location.origin).pathname
  } catch {
    return ''
  }
}

export function installSessionGuard(): void {
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Vista Test/Live: ogni chiamata API del backoffice dichiara l'ambiente
    // corrente nell'header x-ambiente (il backend lo onora solo per i ruoli
    // autorizzati). Le pagine cliente (/pratica/...) non sono toccate.
    const requestPath = pathnameOf(input)
    if (requestPath.startsWith('/api/') && window.location.pathname.startsWith('/backoffice')) {
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
      if (!headers.has('x-ambiente')) headers.set('x-ambiente', getAmbiente())
      init = { ...(init || {}), headers }
    }

    const res = await originalFetch(input, init)

    if (res.status === 401 && !redirecting) {
      const apiPath = pathnameOf(input)
      const pagePath = window.location.pathname
      const isBackofficeApi = apiPath.startsWith('/api/') && !apiPath.startsWith('/api/backoffice/auth/login')
      const isBackofficePage = pagePath.startsWith('/backoffice') && pagePath !== LOGIN_PATH

      if (isBackofficeApi && isBackofficePage) {
        redirecting = true
        localStorage.removeItem('nsm_user')
        window.location.replace(`${LOGIN_PATH}?scaduta=1`)
      }
    }

    return res
  }
}
