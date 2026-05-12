# Guida Demo — NSM EOL Grenke

Questa guida accompagna la presentazione del template applicativo EOL Grenke. Segui lo scenario passo per passo per mostrare l'intero ciclo di vita di una pratica.

---

> **NOTA FISCALE IMPORTANTE**
>
> Il template genera **ricevute di conferma pagamento** (NON fatture fiscali).
> Le fatture elettroniche vengono emesse dall'ERP aziendale via SDI.
> Vedi `docs/integration-guide.md` sezione 7 per i dettagli dell'integrazione.

---

## Prerequisiti

- Node.js >= 20 LTS
- npm >= 10
- Docker (per Mailpit)

## Setup ambiente demo

```bash
# 1. Installa dipendenze
npm install

# 2. Reset completo + seed demo (15 contratti a vari stadi del ciclo di vita)
npm run demo:reset

# 3. Avvia Mailpit (server email locale)
docker compose up -d mailpit

# 4. Avvia backend + frontend
npm run dev
```

**URL:**

| Servizio | URL |
|---|---|
| Frontend backoffice | http://localhost:5173/backoffice |
| Area cliente (link dai token) | http://localhost:5173/pratica/:token |
| Backend API | http://localhost:3001 |
| Mailpit (email inviate) | http://localhost:8025 |
| Prisma Studio | `npx prisma studio --schema=backend/prisma/schema.prisma` |

## Credenziali demo

Il seed crea questi utenti backoffice:

| Ruolo | Email | Password |
|---|---|---|
| Admin | admin@nsm.local | admin123 |
| Backoffice interno | backoffice@nsm.local | backoffice123 |
| Agente senior | mario.rossi@nsm.local | agente123 |
| Agente junior | giulia.bianchi@nsm.local | agente123 |
| Capo area | luca.verdi@nsm.local | agente123 |

Al termine del seed, nella console viene stampata una tabella con i **link diretti** all'area cliente per ogni contratto demo.

Il file `DEMO_LINKS.md` nella root del progetto contiene tutti i link.

---

## Scenario guidato (45 minuti)

### Atto 1 — Panoramica backoffice (10 min)

1. **Login** su http://localhost:5173/backoffice/login con `admin@nsm.local` / `admin123`
2. **Dashboard**: mostra KPI, rischio silenzio, pratiche recenti
3. **Lista pratiche**: filtra per stato, mostra le 15 pratiche demo a vari stadi
4. **Dettaglio pratica**: apri una pratica, mostra le tab (Dettaglio, Comunicazioni, Timeline, Audit)
5. **Audit log**: mostra la catena hash SHA-256, verifica integrita (badge verde)

### Atto 2 — Importazione e comunicazione (10 min)

1. **Importa lista**: vai su "Importa lista", carica il file `data-samples/grenke-lista-esempio.xlsx`
2. **Anteprima**: mostra riconciliazione automatica e gestione outlier
3. **Conferma importazione**: i contratti vengono creati con stato `LISTA_RICEVUTA`
4. **Invio comunicazione**: dalla lista pratiche, invia comunicazione batch
5. **Mailpit**: apri http://localhost:8025 per vedere le email inviate con i link all'area cliente

### Atto 3 — Area cliente self-service (15 min)

Usa i link dal file `DEMO_LINKS.md` (o dalla console del seed).

**Flusso riacquisto:**
1. Apri il link di una pratica in stato `COMUNICAZIONE_INVIATA`
2. Mostra la scheda contratto con pricing riacquisto e gift card
3. Clicca "Riacquista i tuoi beni"
4. Scegli "Procedi direttamente"
5. Accetta termini e condizioni con OTP (il codice e in console backend)
6. Scegli metodo di pagamento (Fabrick o Stripe)
7. Il pagamento mock si completa automaticamente
8. Mostra la ricevuta di pagamento scaricabile

**Flusso restituzione:**
1. Apri un'altra pratica
2. Clicca "Restituisci i beni"
3. Conferma con OTP
4. Mostra il verbale di restituzione firmato FEA (mock)

**Flusso rinnovo:**
1. Apri un'altra pratica
2. Clicca "Rinnova con nuovi beni"
3. Compila il form di prequalificazione (tipo device, durata, budget)
4. Conferma con OTP
5. Mostra la conferma di rinnovo con valore gift card

**Flusso contatto:**
1. Apri un'altra pratica
2. Clicca "Voglio essere contattato"
3. Scegli fascia oraria e modalita

### Atto 4 — Gestione operativa (5 min)

1. **Task agente**: login come `mario.rossi@nsm.local`, mostra "I miei Task" con decisioni rinnovo/contatto assegnate
2. **Task escalation**: mostra le chiamate da fare (T-50/T-40/T-35), registra un esito
3. **Riacquisti in attesa**: mostra pratiche "contattatemi", sblocca un pagamento
4. **Reportistica**: mostra report sintesi, perdite silenzio, performance agenti

### Atto 5 — Funzionalita avanzate (5 min)

1. **Export Grenke**: vai su "Export Grenke", seleziona periodo, mostra anteprima, genera Excel
2. **Outlier**: mostra gestione outlier con suggerimenti di matching
3. **Scheduler**: da Prisma Studio o con curl, trigger manuale dello scheduler per mostrare le regole di silenzio
4. **Audit export PDF**: dalla tab Audit di una pratica, scarica il PDF dell'audit trail

---

## Trigger manuale scheduler

Per simulare l'avanzamento temporale senza aspettare:

```bash
# Esegui scheduler con data odierna
curl -X POST http://localhost:3001/api/admin/scheduler/run-now \
  -H "Content-Type: application/json" \
  -H "x-user-id: admin-user-id" \
  -d '{}'

# Esegui con data simulata (es. T-30 per una pratica con scadenza fra 30 giorni)
curl -X POST http://localhost:3001/api/admin/scheduler/run-now \
  -H "Content-Type: application/json" \
  -H "x-user-id: admin-user-id" \
  -d '{"simulate_date": "2026-07-01"}'
```

## Reset ambiente

Per ricominciare da zero:

```bash
npm run demo:reset
```

Questo comando esegue: reset DB + seed base + seed demo (15 contratti).

---

## Note per il presentatore

- Le email vengono catturate da Mailpit (nessuna email reale viene inviata)
- I codici OTP vengono stampati nella console del backend
- I pagamenti mock si completano automaticamente dopo ~3 secondi
- Il file `DEMO_LINKS.md` viene rigenerato ad ogni `demo:reset`
- Le ricevute PDF generate sono ricevute di conferma pagamento, NON fatture fiscali
