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

# Generate sample Excel for testing import
npx tsx data-samples/generate-sample.ts
```

## Architecture

**Monorepo** with npm workspaces: `backend/` and `frontend/`.

### Backend (`@nsm-eol/backend`)
- **Runtime**: Express 5, TypeScript (ESM via tsx), Node ≥ 20
- **ORM**: Prisma with SQLite (dev) — schema at `backend/prisma/schema.prisma`
- **8 entities**: Contratto_EOL, Cliente, Decisione_Cliente, Pagamento, Comunicazione, Richiesta_Contatto, Audit_Event, Utente_NSM
- **Routes**: mounted at `/api/backoffice` — import preview + confirm endpoints
- **Auth**: `x-user-id` header middleware checking Utente_NSM (roles: BACKOFFICE_INTERNO, ADMIN)
- **Services**: `reconciliation.service.ts` (Excel parsing + DB matching), `pricing.service.ts` (canone calculations + gift card)
- **Excel parsing**: SheetJS (xlsx) with `{ cellDates: true }` — Italian DD/MM/YYYY dates handled by custom `parseDate()`

### Frontend (`@nsm-eol/frontend`)
- **Stack**: React 19, Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite` plugin), TypeScript
- **UI**: lucide-react icons, sonner toasts, no component library (vanilla Tailwind)
- **Routing**: react-router-dom — currently one page at `/backoffice/import`
- **API proxy**: Vite proxies `/api` → `http://localhost:3001`

### Config (`config/`)
JSON-driven business rules read at startup by backend services:
- `pricing_rules.json` — percentages for grenke/riacquisto/margine
- `loyalty_program.json` — gift card standard cuts
- `excel_mapping.json` — column name → DB field mapping + required fields
- `timeline.json`, `assignment_rules.json`, `feature_flags.json` — future missions

## Key Domain Concepts

- **Reconciliation**: match Excel rows to existing DB contracts via `contratto_grenke_id`. Unmatched = OUTLIER_DA_GESTIRE with fuzzy suggestions by P.IVA / ragione_sociale.
- **Pricing**: monte_canoni = canone × mesi; grenke = 5%; riacquisto = 8%; margine = 3%; gift card = floor to nearest standard cut.
- **Outlier actions**: SCARTA (discard with motivazione), CREA (new client), ASSOCIA (link to existing client).
- **Test user ID**: `00000000-0000-0000-0000-000000000001` (backoffice user for x-user-id header).

## Gotchas

- **Zod v4**: use `.issues` not `.errors` on ZodError. `z.coerce.date()` can fail on Date objects in server context — use `z.union([z.date(), z.string(), z.number()]).transform(parseDate)` instead.
- **SQLite JSON**: `beni_json`, `allegati_json`, `dati_json` are stored as String columns (SQLite has no native JSON type).
- **Italian dates**: JS `new Date("17/06/2023")` is invalid. Always use the custom DD/MM/YYYY regex parser.
- **Prisma dangerous actions under Claude Code**: requires `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="si"` env var for `migrate reset`.

## Mission Progress

Development follows MISSIONS.md (10 missions total). Check that file for current status and next steps.
