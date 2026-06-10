# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NSM EOL Grenke — end-of-lease management platform for Grenke FLEX contracts, built for Smartcom Solutions / Noleggio Su Misura. Manages the full lifecycle: Excel import → automatic reconciliation → client communication → client decision → payment → closure.

## Commands

```bash
# Development (starts backend + frontend concurrently)
npm run dev                # both workspaces
npm run dev:backend        # backend only (Express on :3001)
npm run dev:frontend       # frontend only (Vite on :5173)

# Database
npm run db:setup           # prisma generate + migrate dev
npm run db:seed            # seed with test data (tsx prisma/seed.ts)
npm run db:reset           # migrate reset --force + re-seed
npm run db:studio          # Prisma Studio GUI

# Type checking
npm run typecheck          # runs tsc --noEmit across workspaces

# Mailpit (local SMTP for dev — requires Docker)
docker compose up -d mailpit   # SMTP on :1025, UI on http://localhost:8025
docker compose down            # stop

# Generate sample Excel for testing import
npx tsx data-samples/generate-sample.ts
```

## Architecture

**Monorepo** with npm workspaces: `backend/` and `frontend/`.

### Backend (`@nsm-eol/backend`)
- **Runtime**: Express 5, TypeScript (ESM via tsx), Node ≥ 20
- **ORM**: Prisma with **PostgreSQL on Supabase** (eu-west-1) — schema at `backend/prisma/schema.prisma`. Datasource uses `DATABASE_URL` (pooled, port 6543, `?pgbouncer=true`) + `directUrl`/`DIRECT_URL` (port 5432, for migrations). RLS enabled deny-by-default on all tables (Prisma connects as owner, bypasses RLS). Migrated from SQLite; old SQLite migrations archived in `backend/prisma/_migrations_sqlite_backup/`.
- **8 entities**: Contratto_EOL, Cliente, Decisione_Cliente, Pagamento, Comunicazione, Richiesta_Contatto, Audit_Event, Utente_NSM
- **Routes**: `/api/backoffice` (import, pratiche, invio comunicazioni, dashboard, advanced queries, outlier, reports), `/api/clienti` (opt-out)
- **Dashboard routes** (`backoffice-dashboard.routes.ts`): risk-silence-counts, KPI, pratiche-recenti
- **Advanced routes** (`backoffice-advanced.routes.ts`): paginated pratiche list with filters, CSV export, pratica detail with timeline, actions (cambia-agente, modifica-deadline, decisione-manuale, reinvia-comunicazione, segna-richiamato, sblocca-pagamento), outlier management, reporting (sintesi, perdite-silenzio, performance-agenti)
- **Auth**: `x-user-id` header middleware checking Utente_NSM. `verifyBackofficeToken` allows all backoffice roles: AGENTE, JUNIOR_AGENT, CAPO_AREA, GROUP_MANAGER, AGENZIA, BACKOFFICE_INTERNO, ADMIN.
- **Services**: `reconciliation.service.ts` (Excel parsing + DB matching), `pricing.service.ts` (canone calculations + gift card), `email.service.ts` (comunicazione iniziale via SMTP), `storage.service.ts` (document storage abstraction)
- **Document storage** (`storage.service.ts`): PDFs (verbale restituzione, conferma rinnovo, ricevuta pagamento, audit export) are generated in-memory as Buffers and saved via `saveDocument(buffer, filename)`. Backend auto-selected: **Supabase Storage** when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (private bucket `SUPABASE_BUCKET`, default `documenti`; DB ref stored as `supabase:<key>`), else **local disk** fallback (`backend/storage/pdfs/`, ref = absolute path). `loadDocument(ref)` auto-detects ref type, so legacy local paths still resolve. PDF gen functions return `{ pdfPath, hash, buffer }` — callers use the returned `buffer` directly. The mock FEA signature provider takes a Buffer (not a path).
- **Providers**: `providers/notification/email.provider.ts` — email via `createEmailProvider()` factory: **Resend** (`ResendEmailProvider`) when `RESEND_API_KEY` set, else **SMTP/nodemailer** (`SmtpEmailProvider`, Mailpit in dev). Both implement the same `EmailProvider` interface (`send`, `sendWithAttachment`). Sender = `RESEND_FROM` (verified domain `noreply@smartcomgroup.it`). Instantiate via `createEmailProvider()`, never `new SmtpEmailProvider()` directly.
- **PEC** (`PecEmailProvider` + `createPecProvider()`): Posta Elettronica Certificata via Aruba SMTP (`smtps.pec.aruba.it:465`). Used in `email.service.ts` only for the `PEC` channel of the comunicazione iniziale (sent to `cliente.pec`); the `EMAIL` channel still uses the normal provider. `createPecProvider()` returns the provider when `PEC_USER` + `PEC_PASSWORD` set, else `null` (PEC channel falls back to the email provider — no legal value). Legal value only PEC→PEC. Sender (`PEC_FROM`) must include the authenticated PEC address.
- **Email templates**: `templates/email/` — Handlebars HTML templates with inline CSS
- **Excel parsing**: SheetJS (xlsx) with `{ cellDates: true }` — Italian DD/MM/YYYY dates handled by custom `parseDate()`

### Frontend (`@nsm-eol/frontend`)
- **Stack**: React 19, Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite` plugin), TypeScript
- **UI**: lucide-react icons, sonner toasts, recharts (LineChart, BarChart), date-fns (Italian locale), no component library (vanilla Tailwind)
- **Layout**: `BackofficeLayout.tsx` wraps all `/backoffice/*` routes with `BackofficeSidebar.tsx` (collapsible desktop sidebar, hamburger mobile overlay) + `<Outlet />`
- **Routing**: react-router-dom with nested routes under `/backoffice`:
  - `/dashboard` — Dashboard (risk-silence cards, 6 KPIs, pratiche recenti)
  - `/pratiche` — ListaPratiche (filters, sortable table, server-side pagination, CSV export)
  - `/pratiche/:id` — PraticaDettaglio (4 tabs: Panoramica/Timeline/Richieste contatto/Audit log + action sidebar with modals)
  - `/miei-task` — MieiTask (agent-only task list)
  - `/task-escalation` — TaskEscalation (phone escalation workflow)
  - `/riacquisti-in-attesa` — RiacquistiInAttesa (buyback unlock)
  - `/import` — ImportLista (Excel upload + reconciliation)
  - `/outlier` — GestioneOutlier (fuzzy matching, associa/crea/scarta — BACKOFFICE_INTERNO/ADMIN only)
  - `/reportistica` — Reportistica (period selector, Recharts graphs, perdite silenzio, performance agenti, CSV export)
  - `/login` — Login (outside layout)
- **API proxy**: Vite proxies `/api` → `http://localhost:3001`

### Config (`config/`)
JSON-driven business rules read at startup by backend services:
- `pricing_rules.json` — percentages for grenke/riacquisto/margine
- `loyalty_program.json` — gift card standard cuts
- `excel_mapping.json` — column name → DB field mapping + required fields
- `timeline.json`, `assignment_rules.json`, `feature_flags.json` — future missions

## Key Domain Concepts

- **Reconciliation**: match Excel rows to existing DB contracts via `contratto_grenke_id`. Unmatched = OUTLIER_DA_GESTIRE with fuzzy suggestions by P.IVA / ragione_sociale.
- **Pricing**: monte_canoni = canone × mesi; **pricing_grenke** (what Grenke charges Smartcom) comes from the Grenke Excel file (column "Prezzo Riacquisto Grenke", REQUIRED — missing/invalid → row ERRORE at import); **pricing_riacquisto** (price charged to the client) = canone_mensile × (numero_mesi / 12), i.e. one monthly fee per contract year; margine_lordo = riacquisto − grenke (real difference, no fixed %); gift card = floor of margine to nearest standard cut. IVA a margine clamps at 0 when margine ≤ 0. The old 5%/8% percentages in pricing_rules.json / Impostazioni are obsolete (only legacy fallbacks).
- **Outlier actions**: SCARTA (discard with motivazione), CREA (new client), ASSOCIA (link to existing client).
- **Comunicazione iniziale**: email + PEC to each client with JWT link to area cliente, 4 options, deadline warning. GDPR-compliant subject line required.
- **Opt-out**: `GET /api/clienti/opt-out?token=...` sets `opt_out_comunicazioni` flag, blocks future automated communications.
- **Test user ID**: `00000000-0000-0000-0000-000000000001` (backoffice user for x-user-id header).
- **Silence risk monitoring**: T-50 (41–50 days), T-40 (36–40 days), T-35 (31–35 days) before contract expiry. KPI target: tasso non-silenzio > 85%.
- **Role-based UI**: sidebar menu items are conditionally visible based on user role (e.g., "I miei Task" for agents only, "Outlier"/"Importa lista" for BACKOFFICE_INTERNO/ADMIN only).

## Gotchas

- **Zod v4**: use `.issues` not `.errors` on ZodError. `z.coerce.date()` can fail on Date objects in server context — use `z.union([z.date(), z.string(), z.number()]).transform(parseDate)` instead.
- **SQLite JSON**: `beni_json`, `allegati_json`, `dati_json` are stored as String columns (SQLite has no native JSON type).
- **Italian dates**: JS `new Date("17/06/2023")` is invalid. Always use the custom DD/MM/YYYY regex parser.
- **Prisma dangerous actions under Claude Code**: requires `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="si"` env var for `migrate reset`.
- **Backend port**: use `BACKEND_PORT` env var (not `PORT`) — `PORT` can conflict with Vite when started via concurrently. Dotenv loads from `backend/.env` using explicit path.
- **Email service env vars**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` (Mailpit fallback), `RESEND_API_KEY` + `RESEND_FROM` (Resend, production), `JWT_SECRET`, `JWT_EXPIRES_OFFSET_DAYS`, `FRONTEND_URL` — all in `backend/.env`. With `RESEND_API_KEY` empty, emails go through Mailpit; set it to activate real sending via Resend.
- **PEC env vars**: `PEC_SMTP_HOST` (default `smtps.pec.aruba.it`), `PEC_SMTP_PORT` (465), `PEC_USER`, `PEC_PASSWORD`, `PEC_FROM`. **Aruba PEC 2FA gotcha**: if the mailbox has 2-step verification, normal SMTP login fails with `535 Authentication failed` — you must generate an app-specific password ("password per email clients" in the Aruba panel) and use it as `PEC_PASSWORD`. Repeated failed logins can temporarily lock SMTP access.
- **Storage env vars**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` — when set, PDFs go to Supabase Storage; else local disk. The service-role key is admin-level (bypasses RLS) — backend-only, never expose to frontend.

## Regole di business — Fine Noleggio Grenke (FLEX)

- **Formula FLEX**: contratti di locazione operativa finanziati da Grenke, durate 12–48 mesi
- **Early termination**: possibile solo dopo 12 mesi dall'attivazione del contratto
- **Opzione riscatto**: a fine contratto il cliente può riscattare i beni (a differenza della formula PLUS, che prevede reso obbligatorio)
- **Transizione automatica**: lo stato del contratto passa a "In Chiusura" automaticamente 3 mesi prima della data di scadenza
- **Workflow stati**: `Attivo → In Chiusura → Chiuso`
- **Processo di reso** (se il cliente non riscatta), 5 step obbligatori:
  1. Disattivazione Find My iPhone / Samsung Knox
  2. Reset del dispositivo (factory reset)
  3. Integrity check (verifica funzionamento e danni)
  4. Packaging originale (imballo adeguato)
  5. Spedizione a Collegno (spese a carico del cliente)
- **Comunicazioni cliente**: notifica automatica all'ingresso in "In Chiusura" + promemoria periodici fino alla scadenza
- **Edge cases da gestire**:
  - Cliente irreperibile (escalation e tentativi di contatto multipli)
  - Dispositivo non restituito entro i termini
  - Richiesta di riscatto tardiva (dopo scadenza deadline)

## Gotchas (continued)

- **PraticaDettaglio infinite loop**: avoid `useCallback` chains depending on objects created at render time (e.g. `getUtente()` returns new object each render). Use `useState` with lazy init or simple `useEffect` with primitive deps like `[id]`.
- **Recharts**: use `recharts` (not Chart.js). `ReferenceLine` for target lines, `Tooltip` with Italian formatters.

## Mission Progress

Development follows MISSIONS.md (10 missions total). Missions 1–9 completed. Check that file for current status and next steps.
