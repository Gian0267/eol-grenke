# NSM EOL Grenke — Template applicativo

Template applicativo per la gestione del workflow di **fine noleggio** (End Of Lease) dei contratti FLEX di Grenke Italia, per Smartcom Solutions Srl / brand Noleggio Su Misura (NSM).

> **Stato:** v1.0.0-template — tutte le 10 missioni completate. Pronto per la consegna al team di sviluppo AWS.

---

## Documenti di riferimento

| File | Contenuto |
|---|---|
| `SPECS.md` | Specifica funzionale completa (entita, flussi, regole di business, KPI, privacy) |
| `MISSIONS.md` | 10 missioni di sviluppo progressive |
| `DECISIONS.md` | Decisioni architetturali |
| `DEMO.md` | Guida demo con scenario guidato (45 min) |
| `docs/integration-guide.md` | Guida integrazione in produzione (sostituzione mock, deploy AWS, SDI) |
| `docs/api-reference.md` | Riferimento completo API (50+ endpoint) |

---

## Architettura

**Monorepo con due workspace:**

- **`backend/`** — Node.js + Express + Prisma + TypeScript + SQLite (prototipo)
- **`frontend/`** — React + Vite + TypeScript + Tailwind + shadcn/ui

**Componenti mockati** (da sostituire in produzione):

- Pagamenti: Fabrick (open banking) + Stripe (carte)
- Firma elettronica avanzata (FEA): provider eIDAS
- Notifiche: SMTP (Mailpit locale), SMS, PEC

Vedi `docs/integration-guide.md` per le indicazioni di sostituzione.

---

## Avvio rapido

### Prerequisiti

- Node.js >= 20 LTS
- npm >= 10
- Docker (per Mailpit)

### Setup iniziale

```bash
npm install
npm run db:setup
npm run db:seed
docker compose up -d mailpit
npm run dev
```

### Setup demo (15 contratti a vari stadi del ciclo di vita)

```bash
npm install
npm run demo:reset
docker compose up -d mailpit
npm run dev
```

Vedi `DEMO.md` per lo scenario guidato completo.

### URL

| Servizio | URL |
|---|---|
| Frontend (backoffice) | http://localhost:5173/backoffice |
| Backend API | http://localhost:3001 |
| Mailpit UI | http://localhost:8025 |
| Prisma Studio | `npx prisma studio --schema=backend/prisma/schema.prisma` |

---

## Struttura del progetto

```
nsm-eol-grenke-template/
├── README.md
├── DEMO.md                         (guida demo)
├── SPECS.md                        (specifica funzionale)
├── MISSIONS.md                     (missioni di sviluppo)
├── DECISIONS.md                    (decisioni architetturali)
├── package.json                    (workspace root)
├── .env.example
├── docker-compose.yml              (Mailpit)
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           (11 modelli: Contratto_EOL, Cliente, Audit_Event, ...)
│   │   ├── seed.ts                 (dati base: utenti, config)
│   │   └── seed-demo.ts            (15 contratti demo)
│   ├── src/
│   │   ├── index.ts                (entry point Express)
│   │   ├── routes/
│   │   │   ├── auth.routes.ts      (login/logout/me)
│   │   │   ├── backoffice.routes.ts (import, pratiche, task, escalation)
│   │   │   ├── backoffice-advanced.routes.ts (dettaglio, azioni, report, export, audit)
│   │   │   ├── backoffice-dashboard.routes.ts (KPI, rischio silenzio)
│   │   │   ├── cliente.routes.ts   (area self-service: 4 flussi decisionali)
│   │   │   ├── admin.routes.ts     (scheduler, audit admin)
│   │   │   └── client.routes.ts    (GDPR opt-out)
│   │   ├── services/
│   │   │   ├── audit.service.ts    (catena hash SHA-256, graceful degradation)
│   │   │   ├── scheduler.service.ts (regole temporali T-150..T-30)
│   │   │   ├── payment.service.ts  (Fabrick + Stripe mock)
│   │   │   ├── email.service.ts    (comunicazione iniziale multicanale)
│   │   │   ├── pdf.service.ts      (verbali, ricevute, conferme, audit export)
│   │   │   ├── pricing.service.ts  (calcolo riacquisto/Grenke/margine)
│   │   │   ├── assignment.service.ts (assegnazione agenti con regole)
│   │   │   ├── otp.service.ts      (generazione/verifica OTP)
│   │   │   ├── reconciliation.service.ts (riconciliazione Excel)
│   │   │   └── grenke-export.service.ts (export Excel per Grenke)
│   │   ├── providers/              (mock: payment, signature, notification)
│   │   ├── middleware/             (auth backoffice, token cliente)
│   │   └── types/
│   └── storage/                    (PDF generati, export Grenke)
│
├── frontend/
│   └── src/
│       ├── App.tsx                 (routing)
│       ├── pages/
│       │   ├── backoffice/         (12 pagine: Dashboard, ListaPratiche, PraticaDettaglio, ...)
│       │   └── cliente/            (6 pagine: AreaPratica, FlussoRiacquisto, FlussoRinnovo, ...)
│       └── components/             (BackofficeLayout, BackofficeSidebar, WidgetChiamami)
│
├── config/                         (pricing_rules, timeline, assignment_rules, feature_flags, ...)
├── templates/                      (email HTML, script telefonici)
├── data-samples/                   (grenke-lista-esempio.xlsx)
└── docs/                           (integration-guide.md, api-reference.md)
```

---

## Comandi

```bash
# Sviluppo
npm run dev                  # Backend + frontend in parallelo
npm run dev:backend          # Solo backend (porta 3001)
npm run dev:frontend         # Solo frontend (porta 5173)

# Database
npm run db:setup             # prisma generate + migrate
npm run db:seed              # Dati base (utenti, config)
npm run db:reset             # Reset completo + seed base
npm run demo:reset           # Reset + seed base + 15 contratti demo

# Build e verifica
npm run build                # Build backend + frontend
npm run typecheck            # Type check globale

# Mailpit
docker compose up -d mailpit # Avvia — UI su http://localhost:8025
docker compose down          # Ferma
```

---

## Privacy e compliance

Il template e progettato con **privacy by design**:

- Comunicazioni classificate come **contrattuali** (GDPR art. 6.1.b)
- Link di **opt-out** in ogni email (diritto di opposizione)
- **Audit log** strutturato con catena hash SHA-256
- **Data minimization** dopo 24 mesi dalla chiusura pratica
- **Token JWT** con scadenza per accesso area cliente

> **Nota fiscale:** il template genera ricevute di conferma pagamento (NON fatture fiscali). Le fatture elettroniche vengono emesse dall'ERP aziendale via SDI. Vedi `docs/integration-guide.md` sezione 7.

---

## Consegna agli sviluppatori

Il template e pronto per la consegna al team di sviluppo Smartcom (AWS).

**Cosa fornire:**
1. Repository Git completo
2. `SPECS.md`, `MISSIONS.md`, `DECISIONS.md`
3. `docs/integration-guide.md` (sostituzione mock, deploy AWS, SDI)
4. `docs/api-reference.md` (50+ endpoint documentati)
5. `DEMO.md` (scenario demo guidato)

**Cosa il team dovra fare:**
- Sostituire i provider mock con quelli reali (Fabrick, Stripe, FEA, SMTP, PEC, SMS)
- Migrare il DB da SQLite a PostgreSQL su AWS RDS
- Implementare autenticazione produttiva (SSO/Cognito)
- Integrare fatturazione elettronica SDI con ERP aziendale
- Integrare con piattaforma NSM esistente (flusso rinnovo, sync contratti)
- Deploy AWS (ECS Fargate + RDS + S3 + CloudFront)
- Conservazione a norma documenti

Tempo stimato: **10-15 settimane**.

---

## Contatti

**Smartcom Solutions Srl** / **Noleggio Su Misura**
Via Tunisia 5, Collegno (TO) — P.IVA 12711040019
Tel: 011 4557949 — info@noleggiosumisura.it

---

## Licenza

Codice proprietario — Smartcom Solutions Srl. Tutti i diritti riservati.
