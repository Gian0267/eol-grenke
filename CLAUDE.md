# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NSM EOL Grenke — end-of-lease management platform for Grenke FLEX contracts, built for Smartcom Solutions / Noleggio Su Misura. Manages the full lifecycle: Excel import → automatic reconciliation → client communication → client decision → payment → closure.

**Status: LIVE at https://eol.smartcomgroup.it (Hostinger), currently in TEST PHASE** — real cloud infra (Supabase DB+Storage, Resend, Aruba PEC) but with test-only helpers active (see "Test phase" section). Linked from the smartcomgroup.it area riservata ("Fine Noleggio EOL" card, separate login — no SSO by explicit choice).

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

# Production build (what Hostinger runs)
npm run build              # backend: tsc → backend/dist; frontend: vite build → frontend/dist
node backend/dist/index.js # serves API + built frontend (NODE_ENV=production)
```

## Deployment (Hostinger)

- **Live URL**: https://eol.smartcomgroup.it — Hostinger shared "Web app Node.js" (hPanel), **auto-deploys on every push to `main`** of GitHub repo `Gian0267/eol-grenke`.
- **Build**: `npm run build` (package manager npm). **Entry file**: `backend/dist/index.js`. Node version: **22.x** (NOT 20 — see gotchas). Env vars are set in hPanel ("Variabili d'ambiente"); local reference copy with real values in `HOSTINGER_ENV.txt` (gitignored).
- **Single deploy**: in production the backend serves the built frontend (`frontend/dist`) with SPA fallback — same origin, no CORS, session cookie flows automatically.
- **Entry bootstrap**: `backend/src/index.ts` only registers `uncaughtException`/`unhandledRejection` handlers (printing to **stdout** — Hostinger runtime logs don't show stderr) and dynamically imports `app.ts` (the real server). A final Express error middleware also logs `[ERROR] <method> <path>` to stdout. Keep this structure: it's the only way to see crash causes in the hPanel "Log di runtime".
- **Listen**: honors `LSNODE_SOCKET` (LiteSpeed Unix socket) with fallback to `BACKEND_PORT`/`PORT`. The `EROFS` socket-cleanup error in logs is harmless noise.
- **Scheduler in production**: shared hosting may suspend idle apps, so the nightly cron (02:00) may not fire. `GET /api/admin/run-scheduler?secret=$SCHEDULER_TRIGGER_SECRET` exists to trigger it from an external cron (e.g. cron-job.org) — NOT yet configured (deliberately, test phase).

### Hostinger deploy gotchas (each one cost a broken deploy)
1. **`NPM_CONFIG_INCLUDE=dev` env var is REQUIRED**: with `NODE_ENV=production`, npm omits devDependencies (typescript, @types/*, vite) and the build fails with TS7016 errors.
2. **Node must be ≥22**: `@supabase/supabase-js` needs native WebSocket; on Node 20 the app crash-loops at import with "Node.js 20 detected without native WebSocket support".
3. **Prisma must use `engineType = "binary"`** (set in schema.prisma generator): the default library engine panics with `PANIC: timer has gone away` on every query because LiteSpeed forks workers after module load. Binary engine = separate process, immune to fork.
4. Login has a rate limiter (~5 attempts/15min per IP) → repeated probing gets HTTP 429.

## Architecture

**Monorepo** with npm workspaces: `backend/` and `frontend/`.

### Backend (`@nsm-eol/backend`)
- **Runtime**: Express 5, TypeScript (ESM via tsx), Node ≥ 20
- **ORM**: Prisma with **PostgreSQL on Supabase** (eu-west-1) — schema at `backend/prisma/schema.prisma`. Datasource uses `DATABASE_URL` (pooled, port 6543, `?pgbouncer=true`) + `directUrl`/`DIRECT_URL` (port 5432, for migrations). RLS enabled deny-by-default on all tables (Prisma connects as owner, bypasses RLS). Migrated from SQLite; old SQLite migrations archived in `backend/prisma/_migrations_sqlite_backup/`.
- **8 entities**: Contratto_EOL, Cliente, Decisione_Cliente, Pagamento, Comunicazione, Richiesta_Contatto, Audit_Event, Utente_NSM
- **Routes**: `/api/backoffice` (import, pratiche, invio comunicazioni, dashboard, advanced queries, outlier, reports), `/api/clienti` (opt-out)
- **Dashboard routes** (`backoffice-dashboard.routes.ts`): risk-silence-counts, KPI, pratiche-recenti
- **Advanced routes** (`backoffice-advanced.routes.ts`): paginated pratiche list with filters, CSV export, pratica detail with timeline, actions (cambia-agente, modifica-deadline, decisione-manuale, reinvia-comunicazione, segna-richiamato, sblocca-pagamento), outlier management, reporting (sintesi, perdite-silenzio, performance-agenti)
- **Auth**: passport-local sessions (`auth.routes.ts`: login/logout/me, bcrypt, express-session cookie `Secure`+`HttpOnly`; `app.set('trust proxy', 1)` is required for the Secure cookie behind Hostinger's proxy). The `x-user-id` header path in `verifyBackofficeToken` is a **dev-only shortcut, disabled when `NODE_ENV=production`** (returns 401 "Sessione non valida"). Allowed backoffice roles: AGENTE, JUNIOR_AGENT, CAPO_AREA, GROUP_MANAGER, AGENZIA, BACKOFFICE_INTERNO, ADMIN. Seed users' `test1234` passwords were changed manually in production.
- **Services**: `reconciliation.service.ts` (Excel parsing + DB matching), `pricing.service.ts` (canone calculations + gift card), `email.service.ts` (comunicazione iniziale via SMTP), `storage.service.ts` (document storage abstraction)
- **Document storage** (`storage.service.ts`): PDFs (verbale restituzione, conferma rinnovo, ricevuta pagamento, audit export) are generated in-memory as Buffers and saved via `saveDocument(buffer, filename)`. Backend auto-selected: **Supabase Storage** when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (private bucket `SUPABASE_BUCKET`, default `documenti`; DB ref stored as `supabase:<key>`), else **local disk** fallback (`backend/storage/pdfs/`, ref = absolute path). `loadDocument(ref)` auto-detects ref type, so legacy local paths still resolve. PDF gen functions return `{ pdfPath, hash, buffer }` — callers use the returned `buffer` directly. The mock FEA signature provider takes a Buffer (not a path).
- **Providers**: `providers/notification/email.provider.ts` — email via `createEmailProvider()` factory: **Resend** (`ResendEmailProvider`) when `RESEND_API_KEY` set, else **SMTP/nodemailer** (`SmtpEmailProvider`, Mailpit in dev). Both implement the same `EmailProvider` interface (`send`, `sendWithAttachment`). Sender = `RESEND_FROM` (verified domain `noreply@smartcomgroup.it`). Instantiate via `createEmailProvider()`, never `new SmtpEmailProvider()` directly.
- **PEC** (`PecEmailProvider` + `createPecProvider()`): Posta Elettronica Certificata via Aruba SMTP (`smtps.pec.aruba.it:465`). Used in `email.service.ts` only for the `PEC` channel of the comunicazione iniziale (sent to `cliente.pec`); the `EMAIL` channel still uses the normal provider. `createPecProvider()` returns the provider when `PEC_USER` + `PEC_PASSWORD` set, else `null` (PEC channel falls back to the email provider — no legal value). Legal value only PEC→PEC. Sender (`PEC_FROM`) must include the authenticated PEC address.
- **Email templates**: `templates/email/` — Handlebars HTML templates with inline CSS. **The live template is the DB copy** (Impostazione rows, read via `configService.getHtml('email.<nome>')`); the file is only a fallback and the seed source. Editing a template file does NOT change production — update the Impostazione row too (or via the Impostazioni admin UI). The PEC channel of the comunicazione iniziale uses a dedicated institutional template (`comunicazione_iniziale_pec.html` / key `email.comunicazione_iniziale_pec`): sober serif style, no emoji/colored boxes. Branding on all templates: header "Smartcom Solutions Srl" with small "Noleggio Su Misura — Divisione Rental di Smartcom Solutions Srl".
- **OTP** (`otp.service.ts`): 6-digit code, 10-min validity, stored in OtpCode and **actually emailed** via the email provider (`generateOtp` sends when destinatario contains '@'). SMS channel has NO provider — code is generated but not delivered. Test backdoor `123456` works only when `NODE_ENV !== 'production'` + feature flag; the matching amber banner in the 3 client flows renders only in dev builds (`import.meta.env.DEV`).
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
  - `/riacquisti-in-attesa` — RiacquistiInAttesa (label "Clienti in attesa": buyback unlock + info requests awaiting a call; route name kept for compatibility)
  - `/import` — ImportLista (Excel upload + reconciliation; preview table shows Prezzo Grenke / Riacquisto Cliente / Margine, margine ≤ 0 highlighted red)
  - `/outlier` — GestioneOutlier (fuzzy matching, associa/crea/scarta — BACKOFFICE_INTERNO/ADMIN only)
  - `/reportistica` — Reportistica (period selector, Recharts graphs, perdite silenzio, performance agenti, CSV export)
  - `/export-grenke` — EsportaListaGrenke; `/utenti` — GestioneUtenti (ADMIN); `/impostazioni` — Impostazioni (ADMIN)
  - `/login` — Login (outside layout)
- **Area cliente** (`/pratica/:token`, JWT link): AreaPratica (dati contratto incl. Durata, 4 option cards with configurable texts) + FlussoRinnovo (4-step wizard: scelta beni → preferenze → OTP → conferma; device options: Prodotti Apple / Prodotti Samsung / Computer Windows / Laptop Windows / Altro; NO budget field — removed by request), FlussoRiacquisto, FlussoRestituzione, contatto personalizzato.
- **API proxy**: Vite proxies `/api` → `http://localhost:3001`

### Config (`config/`)
JSON-driven business rules read at startup by backend services:
- `pricing_rules.json` — legacy percentages (grenke/riacquisto % are OBSOLETE — see Pricing; `iva_percentuale` still used)
- `loyalty_program.json` — gift card standard cuts
- `excel_mapping.json` — column name → DB field mapping + required fields (includes mandatory "Prezzo Riacquisto Grenke" → `pricing_grenke`)
- `timeline.json`, `assignment_rules.json`, `feature_flags.json` — future missions

## Test phase (TEMPORARY — remove before real production)

All marked `SOLO FASE DI TEST` in code. Removal checklist also in auto-memory (`project_eol_fase_test.md`):
- **Reset button** in sidebar ("Reset dati test (15)", ADMIN/BACKOFFICE_INTERNO) → `POST /api/admin/test/reset-pratiche` → `test-data.service.ts`: wipes ALL operational data (keeps Utente_NSM + Impostazione), recreates 15 FLEX_ATTIVO contracts and **downloads the matching Grenke Excel** (with the mandatory Prezzo Riacquisto Grenke column, simulated at ~60% of client price) to test the full import → workflow cycle.
- **`TEST_MAIL_REDIRECT` env var** (set in hPanel + local .env = g.ciardo@gmail.com): `TestRedirectEmailProvider` reroutes EVERY outgoing email to that address with subject prefix `(mail cliente)` / `(pec cliente)` and an amber banner showing the original recipient. With it set, the PEC channel does NOT touch Aruba (zero real PEC consumed). Remove the var → real sending resumes.
- Test clients use Gmail aliases `g.ciardo+eolNN@gmail.com` (email) and `g.ciardo+eolNNpec@gmail.com` (PEC field) so everything lands in the owner's real inbox even without the redirect.

## Key Domain Concepts

- **Reconciliation**: match Excel rows to existing DB contracts via `contratto_grenke_id`. Unmatched = OUTLIER_DA_GESTIRE with fuzzy suggestions by P.IVA / ragione_sociale.
- **Pricing**: monte_canoni = canone × mesi; **pricing_grenke** (what Grenke charges Smartcom) comes from the Grenke Excel file (column "Prezzo Riacquisto Grenke", REQUIRED — missing/invalid → row ERRORE at import); **pricing_riacquisto** (price charged to the client) = canone_mensile × (numero_mesi / 12), i.e. one monthly fee per contract year; margine_lordo = riacquisto − grenke (real difference, no fixed %); gift card = floor of margine to nearest standard cut. IVA a margine clamps at 0 when margine ≤ 0. The old 5%/8% percentages in pricing_rules.json / Impostazioni are obsolete (only legacy fallbacks).
- **Outlier actions**: SCARTA (discard with motivazione), CREA (new client), ASSOCIA (link to existing client).
- **Comunicazione iniziale**: email + PEC to each client with JWT link to area cliente, 4 options, deadline warning. GDPR-compliant subject line required.
- **Opt-out**: `GET /api/clienti/opt-out?token=...` sets `opt_out_comunicazioni` flag, blocks future automated communications.
- **Test user ID**: `00000000-0000-0000-0000-000000000001` (backoffice user for x-user-id header — dev only, header disabled in production).
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

Development follows MISSIONS.md (10 missions total). Missions 1–9 completed. The platform is now deployed and in test phase (June 2026): users test the real flows on eol.smartcomgroup.it and request adjustments. The operations manual (`manuale/`) is STALE — it will be updated in one batch (with fresh screenshots) at the end of the test phase; recent renames/changes (Clienti in attesa, rinnovo form, PEC template, pricing) are not yet reflected there.
