# API Reference

Elenco completo delle rotte HTTP esposte dal backend NSM EOL Grenke.

---

## Base URL

```
http://localhost:3001/api   (dev)
```

In produzione: configurabile via `FRONTEND_URL` / reverse proxy.

---

## Autenticazione

Due meccanismi distinti:

1. **Token JWT cliente** (path param `/pratica/:token`): per accedere alle route `/api/cliente/*` dall'area cliente self-service. Il token e incluso nel link inviato via email.
2. **Sessione operatore NSM** (cookie httpOnly via passport): per accedere alle route `/api/backoffice/*` e `/api/admin/*`. Fallback header `x-user-id` in dev.

---

## Aree

| Area | Prefisso | Auth | Descrizione |
|---|---|---|---|
| Health | `/api/health` | nessuna | Monitoring |
| Auth | `/api/backoffice/auth/*` | nessuna (login) / sessione | Autenticazione operatori |
| Backoffice | `/api/backoffice/*` | Sessione operatore | Gestione operativa NSM |
| Backoffice Dashboard | `/api/backoffice/dashboard/*` | Sessione operatore | KPI e metriche |
| Cliente | `/api/cliente/*` | JWT cliente | Area self-service del Conduttore |
| Pagamenti callback | `/api/pagamenti/callback/*` | firma provider | Webhook da provider pagamenti |
| Admin | `/api/admin/*` | Sessione admin | Funzioni amministrative |
| GDPR | `/api/clienti/*` | query param token | Opt-out e diritti GDPR |

---

## Health

### `GET /api/health`

Stato del backend.

**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-05-12T10:00:00.000Z", "version": "0.1.0" }
```

---

## Auth (Backoffice)

### `POST /api/backoffice/auth/login`

Login operatore NSM.

**Body:** `{ "email": "string", "password": "string" }`
**Response 200:** `{ "id", "nome", "cognome", "email", "ruolo" }`
**Response 401:** credenziali errate

### `POST /api/backoffice/auth/logout`

Distrugge la sessione.

**Response 200:** `{ "success": true }`

### `GET /api/backoffice/auth/me`

Restituisce l'utente autenticato dalla sessione.

**Response 200:** `{ "id", "nome", "cognome", "email", "ruolo" }`
**Response 401:** non autenticato

---

## Backoffice — Import

### `POST /api/backoffice/import/preview`

Upload e anteprima del file Excel Grenke. Esegue riconciliazione automatica.

**Content-Type:** `multipart/form-data`
**Body:** campo `file` con `.xlsx`
**Response 200:** array di `PreviewRow` con status `RICONCILIATO_AUTO` | `OUTLIER_DA_GESTIRE` | `ERRORE`

### `POST /api/backoffice/import/confirm`

Conferma importazione. Crea contratti EOL e genera token JWT per ogni pratica.

**Body:** `{ "rows": PreviewRow[], "outlierDecisions": OutlierDecision[] }`
**Response 200:** `{ "success", "creati", "scartati", "errori", "contrattiCreati" }`

---

## Backoffice — Pratiche

### `GET /api/backoffice/pratiche`

Lista di tutte le pratiche EOL.

**Response 200:** array di contratti con dati cliente inclusi

### `POST /api/backoffice/pratiche/:id/invia-comunicazione`

Invio comunicazione iniziale (email + PEC) a un singolo contratto.

**Response 200:** `{ "success", "risultati_canali" }`
**Response 400:** stato non valido o opt-out

### `POST /api/backoffice/pratiche/invia-comunicazione-batch`

Invio batch a tutte le pratiche in stato `LISTA_RICEVUTA`.

**Response 200:** `{ "totale", "inviati", "saltati", "errori", "dettagli" }`

### `GET /api/backoffice/riacquisti-in-attesa`

Pratiche in stato `RIACQUISTO_IN_ATTESA_CHIAMATA` (il cliente ha scelto "contattatemi" pre-pagamento).

**Response 200:** array di contratti con ultima richiesta contatto

### `POST /api/backoffice/pratiche/:id/sblocca-pagamento`

Sblocca la pratica dopo la chiamata dell'agente. Riporta allo stato `IN_ATTESA_DECISIONE` e invia email al cliente con link per riprendere il pagamento.

**Response 200:** `{ "success", "messaggio" }`

---

## Backoffice — Task

### `GET /api/backoffice/miei-task`

Task assegnati all'utente loggato (decisioni RINNOVO/CONTATTO).

**Query params:** `tipo` (RINNOVO|CONTATTO), `stato`
**Response 200:** array di task con dati cliente e prequalificazione

### `GET /api/backoffice/task-escalation`

Task escalation telefonici (T-50/T-40/T-35). Admin vede tutti, agenti vedono solo i propri.

**Response 200:** array di task con storico comunicazioni

### `POST /api/backoffice/task-escalation/:id/esito`

Registra esito della chiamata di escalation.

**Body:** `{ "esito": "RISPOSTA_POSITIVA"|"RISPOSTA_NEGATIVA"|"NON_RAGGIUNTO"|"RICHIAMARE", "note?", "decisione_cliente?" }`
**Response 200:** `{ "success", "task_stato" }`

---

## Backoffice — Pratiche avanzate

### `GET /api/backoffice/pratiche-avanzate`

Lista paginata e filtrabile di tutte le pratiche.

**Query params:** `page`, `pageSize`, `sortBy`, `sortOrder`, `stato`, `agente_id`, `data_scadenza_from`, `data_scadenza_to`, `origine`, `decisione`, `rischio_silenzio`
**Response 200:** `{ "items", "total", "page", "pageSize" }`

### `GET /api/backoffice/pratiche-avanzate/export-csv`

Export CSV delle pratiche filtrate.

**Query params:** stessi filtri di `pratiche-avanzate`
**Response:** file CSV (charset UTF-8 con BOM)

---

## Backoffice — Dettaglio pratica

### `GET /api/backoffice/pratiche-dettaglio/:id`

Dettaglio completo della pratica con timeline, decisioni, comunicazioni, pagamenti, task escalation.

**Response 200:** oggetto pratica completo con `timeline[]`

### `POST /api/backoffice/pratiche-dettaglio/:id/cambia-agente`

**Body:** `{ "agente_id": "string" }`

### `POST /api/backoffice/pratiche-dettaglio/:id/modifica-deadline`

**Body:** `{ "nuova_data": "YYYY-MM-DD", "motivazione": "string" }`

### `POST /api/backoffice/pratiche-dettaglio/:id/decisione-manuale`

Inserimento manuale decisione da backoffice.

**Body:** `{ "decisione": "RINNOVO"|"RIACQUISTO"|"CONTATTO"|"RESTITUZIONE", "note?" }`

### `POST /api/backoffice/pratiche-dettaglio/:id/reinvia-comunicazione`

Reinvio comunicazione iniziale dalla pagina dettaglio.

### `POST /api/backoffice/pratiche-dettaglio/:id/segna-richiamato`

Segna una richiesta contatto come richiamata.

**Body:** `{ "richiesta_id": "string" }`

---

## Backoffice — Audit log

### `GET /api/backoffice/pratiche-dettaglio/:id/audit`

Lista eventi audit per il contratto, ordinati cronologicamente.

**Response 200:** array di `Audit_Event`

### `GET /api/backoffice/pratiche-dettaglio/:id/audit/verify`

Verifica integrita della catena hash SHA-256 per il contratto.

**Response 200:** `{ "integra", "eventi", "primo_evento", "ultimo_evento", "errore_al_evento_N?" }`

---

## Backoffice — Outlier

### `GET /api/backoffice/outliers`

Lista contratti con `stato_riconciliazione = OUTLIER_DA_GESTIRE`.

### `GET /api/backoffice/outliers/:id/suggestions`

Suggerimenti di clienti esistenti da associare all'outlier (fuzzy match su ragione sociale e P.IVA).

**Response 200:** array di clienti con score di matching

### `POST /api/backoffice/outliers/:id/resolve`

Risolve un outlier.

**Body:** `{ "action": "ASSOCIA"|"CREA"|"SCARTA", "clienteId?", "motivazione?" }`

---

## Backoffice — Agenti

### `GET /api/backoffice/agenti`

Lista agenti attivi con id, nome, cognome, email, ruolo.

---

## Backoffice — Grenke Export

### `GET /api/backoffice/grenke-export/preview?da=YYYY-MM-DD&a=YYYY-MM-DD`

Anteprima pratiche `RIACQUISTO_PAGATO` nel periodo, pronte per export.

**Response 200:** array di `PreviewRow` con importi netto/iva/totale

### `POST /api/backoffice/grenke-export/genera`

Genera file Excel per Grenke.

**Body:** `{ "da": "YYYY-MM-DD", "a": "YYYY-MM-DD", "esclusi?": ["contratto_id", ...] }`
**Response 200:** `{ "success", "filename", "righe" }`

### `GET /api/backoffice/grenke-export/storico`

Lista file Excel generati in precedenza.

**Response 200:** array di `{ "filename", "data", "size" }`

### `GET /api/backoffice/grenke-export/download/:filename`

Download di un file Excel generato.

**Response:** file `.xlsx`

---

## Backoffice — Reportistica

### `GET /api/backoffice/reports/sintesi?periodo=mese|trimestre|anno`

Report di sintesi: totale pratiche, rinnovi, riacquisti, restituzioni, silenzi, tasso non-silenzio, andamento per mese.

### `GET /api/backoffice/reports/perdite-silenzio?periodo=mese|trimestre|anno`

Dettaglio perdite per silenzio: totale margine perso, lista pratiche.

### `GET /api/backoffice/reports/performance-agenti?periodo=mese|trimestre|anno`

Performance per agente: pratiche totali, tasso non-silenzio, margine generato, silenzi.

---

## Backoffice — Dashboard

### `GET /api/backoffice/dashboard/risk-silence-counts`

Conteggi pratiche a rischio silenzio per fascia temporale.

### `GET /api/backoffice/dashboard/kpi`

KPI principali: pratiche totali, in attesa, decise, tasso conversione, margine.

### `GET /api/backoffice/dashboard/pratiche-recenti`

Ultime pratiche aggiornate.

---

## Cliente (area self-service)

Tutte le route richiedono JWT valido via middleware `verifyClienteToken`.

### `GET /api/cliente/pratica`

Dati della pratica del cliente: informazioni contratto, pricing riacquisto, deadline decisione.

### `POST /api/cliente/richiesta-contatto`

Widget "Chiamami". Deduplica (max 1 richiesta DA_GESTIRE per contratto nelle ultime 24h).

**Body:** `{ "nome", "telefono", "giorno_preferito?", "fascia_oraria?" }`

### `POST /api/cliente/decisione/restituzione/inizia`

Avvia flusso restituzione: invia OTP.

**Body:** `{ "metodo": "SMS"|"EMAIL" }`

### `POST /api/cliente/decisione/restituzione/conferma`

Conferma restituzione con OTP. Genera verbale PDF firmato FEA, chiude pratica.

**Body:** `{ "codice": "123456", "metodo": "SMS"|"EMAIL" }`

### `GET /api/cliente/decisione/pdf`

Download del verbale PDF di restituzione.

### `POST /api/cliente/decisione/riacquisto/inizia`

Avvia flusso riacquisto. Due scelte: `contattatemi` (crea richiesta contatto) o `procedi` (mostra pricing).

**Body:** `{ "choice": "contattatemi"|"procedi", "nome?", "telefono?", ... }`

### `POST /api/cliente/decisione/riacquisto/richiedi-otp`

Richiede OTP per conferma riacquisto.

**Body:** `{ "metodo": "SMS"|"EMAIL" }`

### `POST /api/cliente/decisione/riacquisto/conferma-tc`

Conferma accettazione termini e condizioni riacquisto con OTP.

**Body:** `{ "codice": "123456", "metodo": "SMS"|"EMAIL" }`

### `POST /api/cliente/decisione/riacquisto/scegli-metodo`

Scelta metodo di pagamento, avvia sessione di pagamento.

**Body:** `{ "metodo": "FABRICK"|"STRIPE" }`
**Response 200:** `{ "session_id", "importi" }`

### `GET /api/cliente/pagamento/:session_id/status`

Verifica stato pagamento in corso.

### `GET /api/cliente/pagamento/:pagamento_id/ricevuta`

Download ricevuta di conferma pagamento (PDF).

### `POST /api/cliente/decisione/rinnovo/inizia`

Avvia flusso rinnovo: invia OTP, raccoglie preferenze device.

**Body:** `{ "tipo_device", "numero_device", "durata_desiderata", "budget_mensile?", "note?", "metodo_otp" }`

### `POST /api/cliente/decisione/rinnovo/conferma`

Conferma rinnovo con OTP. Genera PDF conferma, notifica agente.

**Body:** `{ "codice", "metodo_otp", "tipo_device", "numero_device", "durata_desiderata", "budget_mensile?", "note?" }`

### `POST /api/cliente/decisione/contatto`

Richiesta contatto personalizzato (quarta opzione).

**Body:** `{ "fascia_oraria", "modalita_preferita": "TELEFONO"|"EMAIL"|"VIDEOCALL", "note?" }`

---

## Pagamenti (webhook)

### `POST /api/pagamenti/callback/:provider/:session_id`

Callback dal provider di pagamento (Fabrick o Stripe). Verifica firma, aggiorna stato pagamento, genera ricevuta PDF.

**Provider:** `fabrick` | `stripe`
**Body:** payload del provider con `stato` e `riferimento_transazione`

---

## Admin

Richiede ruolo `ADMIN` o `BACKOFFICE_INTERNO`.

### `POST /api/admin/scheduler/run-now`

Trigger manuale dello scheduler. Opzionalmente con data simulata per test.

**Body:** `{ "simulate_date?": "YYYY-MM-DD" }`
**Response 200:** `{ "success", "report" }` con dettaglio operazioni eseguite

### `GET /api/admin/audit/verify/:contratto_id`

Verifica integrita catena hash audit per un contratto.

**Response 200:** `{ "integra", "eventi", "primo_evento", "ultimo_evento" }`

### `GET /api/admin/audit/:contratto_id`

Lista completa eventi audit per un contratto.

### `GET /api/admin/audit/export/:contratto_id`

Download export PDF dell'audit log (testo ASCII-only per compatibilita).

**Response:** file PDF

---

## GDPR

### `GET /api/clienti/opt-out?token=...`

Esercizio diritto di opposizione. Segna il cliente come opt-out per comunicazioni future.

---

## Convenzioni di risposta

### Successo

```json
{ "success": true, "data": { ... } }
```

### Errore

```json
{ "error": "Messaggio di errore" }
```

oppure con dettagli:

```json
{ "errore": "Messaggio", "dettagli": { ... } }
```

### Codici di stato HTTP

| Codice | Significato |
|---|---|
| `200 OK` | Successo |
| `201 Created` | Risorsa creata |
| `400 Bad Request` | Validazione fallita |
| `401 Unauthorized` | Token mancante o non valido |
| `403 Forbidden` | Permessi insufficienti |
| `404 Not Found` | Risorsa non trovata |
| `409 Conflict` | Stato conflittuale (es. decisione gia registrata) |
| `429 Too Many Requests` | Rate limit (es. richiesta contatto duplicata) |
| `500 Internal Server Error` | Errore generico |
