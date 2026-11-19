# Hotel Geo Vouchers — notes for Claude Code

Spec: `docs/stage-a-spec.md` (Stage A). Build order is spec §11; **milestone 1 (setup) is done**.
Next.js-specific agent rules: @AGENTS.md (this is Next.js 16 with Cache Components — read
`node_modules/next/dist/docs/` before using unfamiliar APIs).

## Stack
- Next.js 16 (App Router, `cacheComponents: true`), TypeScript, Tailwind v4 — mobile-first.
- Supabase: Postgres + RLS, private Storage bucket `voucher-images`, Auth (milestone 2).
- Vercel Hobby, auto-deploys from GitHub `main`; preview deploys on pull requests.

## Commands
```bash
npm install            # install deps (Node >= 20.9; developed on Node 22)
npm run dev            # http://localhost:3000 — needs .env.local (copy .env.example)
npm test               # Vitest: unit tests + DB tests (migrations + seed run in PGlite, no Docker)
npm run lint           # ESLint
npm run typecheck      # next typegen && tsc --noEmit
npm run build          # production build (what Vercel runs)
```
Before committing: `npm run lint && npm run typecheck && npm test && npm run build`.

## Deploy
- Push/merge to `main` → Vercel builds and deploys production automatically. PRs get preview URLs.
- `NEXT_PUBLIC_*` vars are inlined at **build** time: after changing them in Vercel, redeploy.
- Health check: `GET /api/health` → 200 `{status:"connected",...}` or 503 with the reason.

## Database
- Migrations: `supabase/migrations/*.sql` (timestamp-prefixed, applied in filename order). Never
  edit a migration that has been applied to the hosted project — add a new file instead.
- Seed: `supabase/seed.sql` (idempotent): departments, the §6 expense heads, admin staff row.
- Apply to the hosted project: paste each migration, then the seed, into Supabase → SQL Editor.
  (Alternative with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
- Tests stub only what Supabase provides (`auth.users`, `auth.uid()`, `storage.buckets`, roles)
  in `tests/db/supabase-stubs.sql`. If a migration references more Supabase internals, extend it.
- RLS is enabled on every table with **no policies yet** (deny all via the API). Role policies
  (staff / accounts / admin) come in milestone 2. `public.app_health()` is the only anon-callable
  function. A test asserts every public table has RLS on — keep it that way.
- Money columns are `numeric(12,2)`; display with `formatINR` from `lib/money.ts` (₹1,23,456.00).
- Voucher numbers `HG-YYMM-NNNN` (IST month) are assigned by a trigger; don't set them in app code.
- Every voucher insert/update is written to `audit_log` by trigger (changed fields only).

## Conventions
- Login identity: `<username>@staff.hotelgeo.app`, password = 6-digit PIN (Supabase Auth).
- Times are IST (`APP_TIMEZONE=Asia/Kolkata`); store `timestamptz`, compute dates in IST.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` are server-only — never prefix with
  `NEXT_PUBLIC_`, never import them in client components. This repo is **public**: never commit
  `.env*` files (only `.env.example`).
- Vision LLM access goes through one module, `lib/extract.ts` (milestone 4), provider-swappable.
