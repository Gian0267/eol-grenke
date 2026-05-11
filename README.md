# NSM EOL Grenke — Template applicativo

Template applicativo per la gestione del workflow di **fine noleggio** (End Of Lease) dei contratti FLEX di Grenke Italia, per Smartcom Solutions Srl / brand Noleggio Su Misura (NSM).

> **Stato:** scaffolding iniziale — pronto per essere sviluppato in Google Antigravity IDE seguendo le missioni in `MISSIONS.md`.

---

## 📚 Documenti di riferimento

Prima di iniziare, leggi (o pinna nel contesto Antigravity):

| File | Contenuto |
|---|---|
| **`SPECS.md`** | Specifica funzionale completa (entità, flussi, regole di business, KPI, privacy) |
| **`MISSIONS.md`** | 10 missioni di sviluppo progressive, con prompt pronti per agent Antigravity |
| **`DECISIONS.md`** | Decisioni architetturali (popolato durante lo sviluppo) |

---

## 🏗️ Architettura

**Monorepo con due workspace:**

- **`backend/`** — Node.js + Express + Prisma + TypeScript + SQLite (prototipo) → PostgreSQL (produzione)
- **`frontend/`** — React + Vite + TypeScript + Tailwind + shadcn/ui

**Componenti mockati** (da sostituire in produzione):

- Pagamenti: Fabrick (open banking) + Stripe (carte)
- Firma elettronica avanzata (FEA): provider eIDAS
- Notifiche: SMTP (Mailpit locale), SMS, PEC

Vedi `docs/integration-guide.md` per le indicazioni di integrazione.

---

## 🚀 Avvio rapido

> ⚠️ Questo è lo **scaffolding iniziale**: il codice viene generato dagli agent Antigravity seguendo le missioni. Lo script di setup completo sarà disponibile dopo la **Missione 1**.

### Prerequisiti

- Node.js ≥ 20 LTS
- npm ≥ 10
- Docker (per Mailpit)
- Git

### Setup iniziale

```bash
# Installa dipendenze in root e workspace
npm install

# Inizializza database + esegui seed
npm run db:setup
npm run db:seed

# Avvia Mailpit (server SMTP locale per dev)
docker compose up -d mailpit

# Avvia backend + frontend in parallelo
npm run dev
```

Backend: <http://localhost:3001>
Frontend: <http://localhost:5173>
Mailpit UI: <http://localhost:8025> (SMTP su porta 1025)
Prisma Studio: `npx prisma studio --schema=backend/prisma/schema.prisma`

---

## 📁 Struttura del progetto

```
nsm-eol-grenke-template/
├── README.md                       (questo file)
├── SPECS.md                        (specifica funzionale)
├── MISSIONS.md                     (missioni di sviluppo)
├── DECISIONS.md                    (decisioni architetturali, da popolare)
├── TEST_SCENARIOS.md               (scenari di test, da popolare in Missione 10)
├── package.json                    (workspace root)
├── .env.example                    (variabili d'ambiente da copiare in .env)
├── .gitignore
├── docker-compose.yml              (Mailpit, da Missione 3)
│
├── backend/                        (Node.js + Express + Prisma)
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma           (schema DB, da Missione 1)
│   │   ├── migrations/
│   │   └── seed.ts                 (dati di test)
│   ├── src/
│   │   ├── index.ts                (entry point Express)
│   │   ├── routes/                 (route HTTP per area)
│   │   ├── services/               (logica di business)
│   │   ├── providers/              (interfacce mockate)
│   │   │   ├── payment/            (Fabrick, Stripe)
│   │   │   ├── signature/          (FEA)
│   │   │   └── notification/       (email, SMS, PEC)
│   │   ├── middleware/             (auth, token cliente, ...)
│   │   ├── utils/
│   │   └── types/
│   ├── storage/                    (PDF generati, export Grenke)
│   └── tests/
│
├── frontend/                       (React + Vite + TS + Tailwind + shadcn/ui)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── cliente/            (area cliente self-service)
│       │   └── backoffice/         (operatori NSM)
│       ├── components/             (WidgetChiamami, ecc.)
│       ├── hooks/
│       ├── services/               (chiamate API)
│       ├── lib/
│       └── types/
│
├── config/                         (file di configurazione JSON)
│   ├── pricing_rules.json
│   ├── timeline.json
│   ├── assignment_rules.json
│   ├── loyalty_program.json
│   ├── excel_mapping.json
│   └── feature_flags.json
│
├── templates/                      (template di comunicazione)
│   ├── email/                      (template HTML email/PEC)
│   ├── pdf/                        (template PDF generati)
│   └── script/                     (script telefonici T-50/T-40/T-35)
│
├── data-samples/                   (dati di esempio per test)
│   ├── README.md
│   ├── grenke-lista-esempio.xlsx   (da generare in Missione 2)
│   └── generate-sample.ts          (script di generazione)
│
└── docs/                           (documentazione tecnica)
    ├── integration-guide.md        (sostituzione mock → produzione)
    ├── api-reference.md            (elenco endpoint API)
    └── data-flow-diagrams/         (diagrammi di flusso dati)
```

---

## 🛠️ Sviluppo con Antigravity

### Setup di Antigravity

1. Apri Antigravity → **File → Open Folder** → seleziona questa cartella
2. Apri **Manager View** (sidebar)
3. **Workspace Context → Add files**: pinna `SPECS.md` e `MISSIONS.md`
4. Per ogni missione di `MISSIONS.md`:
   - Crea un **nuovo agent** dedicato
   - Scegli il **modello AI suggerito** dalla missione
   - Copia il **prompt iniziale** della missione nel chat
   - Lascia che l'agent lavori in autonomia
   - Verifica i **criteri di accettazione**
   - Committa con il messaggio Git suggerito
5. Procedi alla missione successiva

### Modelli AI consigliati per missione

| Tipo missione | Modello consigliato |
|---|---|
| Default (codice business, integrazione) | Claude Sonnet 4.6 |
| Architettura complessa, edge case sottili, audit | Claude Opus 4.6 |
| UI/UX intensive (area cliente, backoffice) | Gemini 3 Pro |

Vedi `MISSIONS.md` per il dettaglio missione per missione.

---

## 📋 Comandi utili

> Disponibili dopo Missione 1.

```bash
# Sviluppo
npm run dev                  # Avvia backend + frontend
npm run dev:backend          # Solo backend
npm run dev:frontend         # Solo frontend

# Database
npm run db:setup             # Esegue prisma generate + migrate
npm run db:seed              # Popola dati di test
npm run db:reset             # Reset completo + reseed
npm run db:studio            # Apre Prisma Studio

# Build
npm run build                # Build backend + frontend per produzione
npm run typecheck            # Type check globale

# Mailpit (server SMTP locale)
docker compose up -d mailpit # Avvia — UI su http://localhost:8025
docker compose down          # Ferma
```

---

## 🔒 Privacy e compliance

Il template è progettato con **privacy by design**:

- Tutte le comunicazioni sono classificate come **contrattuali** (GDPR art. 6.1.b) — non serve consenso marketing
- Ogni email contiene link di **opt-out** (diritto di opposizione)
- **Audit log** strutturato con catena di hash crittografica (SHA-256)
- **Data minimization** dopo 24 mesi dalla chiusura pratica
- **Token JWT** con scadenza per accesso area cliente (no autenticazione invasiva)

Dettagli: vedi `SPECS.md` sezione 11.

---

## 🤝 Consegna agli sviluppatori finali

Quando tutte le 10 missioni sono completate, il template è pronto per la consegna al team di sviluppo Smartcom (AWS).

Cosa fornire:

1. **Repository Git** completo
2. `SPECS.md`, `MISSIONS.md`, `DECISIONS.md`, `TEST_SCENARIOS.md`
3. `docs/integration-guide.md` (come integrare i provider reali)
4. `docs/api-reference.md` (elenco API)
5. `data-samples/` (file Excel di test)

Cosa il team di sviluppo dovrà fare:

- Sostituire i provider mock (Fabrick, Stripe, FEA, SMTP, PEC, SMS) con quelli reali
- Migrare il DB da SQLite a PostgreSQL su AWS RDS
- Implementare autenticazione produttiva (SSO con Active Directory o Auth0)
- Implementare la fatturazione di saldo a T0 (oggi solo acconto)
- Integrare con il sistema NSM esistente per il flusso di rinnovo
- Deploy AWS, test di carico, conservazione a norma documenti

Tempo stimato di integrazione produzione: **10–15 settimane**.

---

## 📞 Contatti

**Smartcom Solutions Srl** / **Noleggio Su Misura**
Via Tunisia 5, Collegno (TO) — P.IVA 12711040019
Tel: 011 4557949 — info@noleggiosumisura.it
Piattaforma: <https://app.smartcomsolutions.it>

---

## 📜 Licenza

Codice proprietario — Smartcom Solutions Srl. Tutti i diritti riservati.
