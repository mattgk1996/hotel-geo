# Hotel Geo Vouchers — notes for Claude Code

Spec: `docs/stage-a-spec.md` (Stage A). Build order is spec §11; **milestones 1 (setup) and 2 (auth & roles) are done**.
Next.js-specific agent rules: @AGENTS.md (this is Next.js 16 with Cache Components — read
`node_modules/next/dist/docs/` before using unfamiliar APIs).

## Working preferences (owner)
- Commit and push directly to `main`; no feature branches or PRs.
- Keep usage low: concise replies, no extra verification passes (mock servers, browser runs);
  lint + typecheck + build is enough unless asked.
- Don't write new tests unless asked; keep the existing suite passing (`npm test`).

## Stack
- Next.js 16 (App Router, `cacheComponents: true`), TypeScript, Tailwind v4 — mobile-first.
- Supabase: Postgres + RLS, private Storage bucket `voucher-images`, Auth (PIN login).
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
- RLS is on for every table, with role policies in migration 3 (`tests/db/rls.test.ts` acts as each
  role). Helpers: `current_staff_id()`, `current_staff_role()`, `is_accounts_or_admin()`, `is_admin()`.
  Tests assert every table has RLS on and a policy — keep it that way; add RLS tests with new policies.
- `guard_voucher_write` trigger enforces what RLS can't: staff can't touch review/flag/Tally fields,
  staff transitions are only draft→submitted and queried→submitted, only admin can void.
- `public.app_health()` is the only anon-callable function.
- Money columns are `numeric(12,2)`; display with `formatINR` from `lib/money.ts` (₹1,23,456.00).
- Voucher numbers `HG-YYMM-NNNN` (IST month) are assigned by a trigger; don't set them in app code.
- Every voucher insert/update is written to `audit_log` by trigger (changed fields only).

## Auth (milestone 2)
- Login identity: `<username>@staff.hotelgeo.app` in Supabase Auth. The Supabase password is
  **not** the PIN: it is `derivePassword(authUserId, pin, PIN_PEPPER)` (`lib/auth/pin.ts`), so PINs
  can't be brute-forced against Supabase with the public key. All PIN checks go through
  `lib/auth/login-core.ts` (pure, unit-tested), which enforces 5 tries → 15-minute lock via the
  `register_failed_pin` / `reset_failed_pins` SQL functions (service role only).
- `staff.pin_derived = false` means the password is still the raw PIN (e.g. the admin created in
  the dashboard); the next successful login upgrades it.
- Sessions end 12 h after the PIN was entered (`amr` timestamp; `lib/auth/session-age.ts`),
  enforced in `proxy.ts` (Next 16's renamed middleware) and `getCurrentStaff()`.
- Every page/action/route calls `requireStaff()` or `requireRole(...)` from `lib/auth/session.ts`;
  `proxy.ts` only redirects logged-out users. Nav per role lives in `lib/auth/roles.ts`.
- Clients (`lib/supabase/server.ts`): `createSupabaseServerClient()` = the logged-in user (RLS);
  `createSupabaseAdminClient()` = service role, only for auth admin calls and lockout counters.
- Cache Components: session reads must sit under a `<Suspense>` (the `(app)` layout has one).
  `createSupabaseServerClient()` calls `connection()` first so it never runs during prerendering.

## Conventions
- Times are IST (`APP_TIMEZONE=Asia/Kolkata`); store `timestamptz`, compute dates in IST.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `PIN_PEPPER` and `GEMINI_API_KEY` are server-only — never prefix with
  `NEXT_PUBLIC_`, never import them in client components. This repo is **public**: never commit
  `.env*` files (only `.env.example`).
- Vision LLM access goes through one module, `lib/extract.ts` (milestone 4), provider-swappable.
