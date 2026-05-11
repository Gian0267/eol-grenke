# API Reference

> **Stato:** placeholder — verrà popolato progressivamente durante le missioni e finalizzato nella **Missione 10**.

Elenco delle rotte HTTP esposte dal backend, organizzate per area.

---

## Base URL

```
http://localhost:3001/api   (dev)
```

In produzione: configurabile via `VITE_API_BASE_URL`.

---

## Autenticazione

Due meccanismi distinti:

1. **Token JWT cliente** (header `Authorization: Bearer <token>` o query param `?token=`): per accedere alle route `/api/cliente/*` dall'area cliente self-service
2. **Sessione operatore NSM** (cookie httpOnly): per accedere alle route `/api/backoffice/*` e `/api/admin/*`

---

## Aree

| Area | Prefisso | Auth | Descrizione |
|---|---|---|---|
| Health | `/api/health` | nessuna | Monitoring |
| Cliente | `/api/cliente/*` | JWT cliente | Area self-service del Conduttore |
| Backoffice | `/api/backoffice/*` | Sessione operatore | Gestione operativa NSM |
| Pagamenti (callback) | `/api/pagamenti/callback/*` | firma provider | Webhook da provider pagamenti |
| Admin | `/api/admin/*` | Sessione admin | Funzioni amministrative |

---

## Health

### `GET /api/health`

Restituisce lo stato del backend.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-11T10:00:00.000Z",
  "version": "0.1.0"
}
```

---

## Cliente (area self-service)

[DA POPOLARE NELLE MISSIONI 3, 4, 5, 6, 7]

Endpoint attesi:

- `GET /api/cliente/pratica` — Dati della pratica del cliente (autenticato via token)
- `POST /api/cliente/richiesta-contatto` — Widget "Chiamami"
- `POST /api/cliente/decisione/rinnovo/inizia`
- `POST /api/cliente/decisione/rinnovo/conferma`
- `POST /api/cliente/decisione/riacquisto/inizia`
- `POST /api/cliente/decisione/riacquisto/conferma-tc`
- `POST /api/cliente/decisione/riacquisto/scegli-metodo`
- `GET /api/cliente/pagamento/:session_id/status`
- `POST /api/cliente/decisione/contatto`
- `POST /api/cliente/decisione/restituzione/inizia`
- `POST /api/cliente/decisione/restituzione/conferma`
- `POST /api/cliente/otp/richiedi`
- `POST /api/cliente/otp/verifica`
- `GET /api/cliente/opt-out` — Esercizio diritto di opposizione

---

## Backoffice

[DA POPOLARE NELLE MISSIONI 2, 7, 8, 9, 10]

Endpoint attesi:

- `POST /api/backoffice/auth/login`
- `POST /api/backoffice/auth/logout`
- `GET /api/backoffice/auth/me`
- `POST /api/backoffice/import/preview`
- `POST /api/backoffice/import/confirm`
- `GET /api/backoffice/pratiche` (con filtri e paginazione)
- `GET /api/backoffice/pratiche/:id`
- `POST /api/backoffice/pratiche/:id/invia-comunicazione`
- `POST /api/backoffice/pratiche/invia-comunicazione-batch`
- `POST /api/backoffice/pratiche/:id/cambia-assegnazione`
- `POST /api/backoffice/pratiche/:id/modifica-deadline`
- `POST /api/backoffice/pratiche/:id/sblocca-pagamento`
- `POST /api/backoffice/pratiche/:id/decisione-manuale`
- `GET /api/backoffice/outliers`
- `POST /api/backoffice/outliers/:id/resolve`
- `GET /api/backoffice/dashboard/risk-silence-counts`
- `GET /api/backoffice/dashboard/kpi`
- `GET /api/backoffice/dashboard/pratiche-recenti`
- `GET /api/backoffice/task-escalation` (per utente loggato)
- `POST /api/backoffice/task-escalation/:id/esito`
- `GET /api/backoffice/grenke-export/preview`
- `POST /api/backoffice/grenke-export/genera`
- `GET /api/backoffice/reports/sintesi`
- `GET /api/backoffice/reports/perdite-silenzio`
- `GET /api/backoffice/reports/performance-agenti`

---

## Pagamenti (webhook)

[DA POPOLARE NELLA MISSIONE 6]

- `POST /api/pagamenti/callback/fabrick/:session_id`
- `POST /api/pagamenti/callback/stripe/:session_id`

---

## Admin

[DA POPOLARE NELLE MISSIONI 8, 10]

- `POST /api/admin/scheduler/run-now` — Trigger manuale dello scheduler
- `GET /api/admin/audit/verify/:contratto_id` — Verifica integrità catena hash
- `DELETE /api/admin/clienti/:id/forget` — Diritto alla cancellazione (GDPR art. 17)

---

## Convenzioni di risposta

### Successo

```json
{
  "data": { ... }
}
```

### Errore

```json
{
  "error": {
    "code": "PRATICA_NON_TROVATA",
    "message": "La pratica richiesta non esiste o non è accessibile",
    "details": { ... }
  }
}
```

### Codici di stato HTTP

- `200 OK` — Successo
- `201 Created` — Risorsa creata
- `400 Bad Request` — Validazione fallita
- `401 Unauthorized` — Token mancante o non valido
- `403 Forbidden` — Token valido ma permessi insufficienti
- `404 Not Found` — Risorsa non trovata
- `409 Conflict` — Conflitto di stato (es. tentativo di doppia decisione)
- `422 Unprocessable Entity` — Stato corrente non permette l'operazione
- `500 Internal Server Error` — Errore generico
