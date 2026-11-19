# Hotel Geo Voucher & Expense App: Stage A Spec

**Owner:** Hotel Geo, Bangalore
**Stage A goal:** Staff photograph handwritten or printed vouchers on their phone. The app reads each photo, files it under the right expense head, Accounts reviews it, and the owner watches spending live on a dashboard.
**Not in Stage A:** WhatsApp approvals (Stage B), Tally sync and hotel-software integration (Stage C), and Google Sheets export (later, optional). Design the data model so these can be added without rework.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend + API | Next.js (App Router), TypeScript, Tailwind | Mobile-first. Installable as a PWA so staff get a home-screen icon. |
| Hosting | Vercel (Hobby for now) | Auto-deploy from the GitHub `main` branch, with preview deploys on pull requests. Move to Vercel Pro when it goes into daily production use. |
| Database, storage, auth | Supabase (Free to start, Pro once photo storage grows) | Postgres with Row Level Security, a private Storage bucket for photos, and Realtime for the dashboard. |
| Voucher reading | Vision LLM through one server-side module (`lib/extract.ts`) | Default is Gemini 2.5 Flash. Keep the provider swappable (Claude Haiku or GPT-4o-mini) behind a single interface. |
| Repo | GitHub `hotel-geo-vouchers` | Commit `docs/stage-a-spec.md` (this file) and a `CLAUDE.md` with run and test commands. |

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `GEMINI_API_KEY` (server only), `APP_TIMEZONE=Asia/Kolkata`.

---

## 2. Users, roles and login

**Login:** a name picker (or typed username) plus a **6-digit PIN**, in English only.
- Implementation: Supabase Auth with a synthetic email per staff member (`<username>@staff.hotelgeo.app`) and the PIN as the password. This gives RLS and sessions without custom crypto.
- Admin creates staff and sets or resets PINs. Staff can change their own PIN.
- Lock the account for 15 minutes after 5 wrong PINs. Sessions last 12 hours on staff phones.

| Role | Can do |
|---|---|
| `staff` | Create vouchers for their department, see their own vouchers, answer queries on them |
| `accounts` | Everything staff can do, plus review, edit, approve, reject or query any voucher; manage vendors; enter daily collections |
| `admin` (owner) | Everything, plus the dashboard, masters (staff, departments, heads, floats), and voiding approved vouchers |

**Departments (seed):** Front Office, Store, Accounts.

---

## 3. Entry types

Every entry is a row in `vouchers` with a `type`:

| Type | Typical source | Photo required | Money direction |
|---|---|---|---|
| `petty_cash_expense` | Handwritten slip or shop bill | Yes | Out (from a cash float) |
| `purchase_bill` | Vendor invoice, often with GST | Yes | Payable to vendor |
| `vendor_payment` | Cheque, UPI or cash paid against bills | Yes (cheque copy or UPI screenshot) | Out |
| `staff_advance` | Advance slip signed by staff | Yes | Out (receivable from staff) |
| `cash_receipt` | Money received (non-sales) | Yes | In |
| `sales_voucher` | Sales / F&B bill | Yes | In |
| `collection` | Daily closing of cash, card and Google Pay | Optional (card settlement slip or UPI report) | In |

**Payment modes:** `cash`, `upi`, `cheque`, `bank_transfer`, `card`, `vendor_credit`.
Cheque payments also store the cheque number, bank and date.

---

## 4. Main flow

```
Staff: New voucher → pick type → take photo(s) → (optional) note/amount
   ↓ upload (client compresses to ~1600px JPEG, ~300 KB)
Server: extract with vision LLM → structured JSON + per-field confidence
   ↓ suggest expense head (vendor history first, then LLM)
Staff: quick confirm screen (amount, vendor, head shown; can fix) → Submit
   ↓ status = submitted
Accounts: review queue → photo beside fields, low-confidence fields highlighted
   → Approve / Edit & approve / Query (back to staff with a note) / Reject
   ↓ status = approved
Dashboard updates live
```

**Statuses:** `draft` → `submitted` → `queried` ↔ `submitted` → `approved` | `rejected` | `void`.
Leave room for future statuses: `pending_whatsapp_approval` (Stage B) and `posted_to_tally` / `tally_error` (Stage C).

Every status change and field edit writes to `audit_log` (who, when, old value, new value).

---

## 5. Reading the photo (extraction)

- Runs server-side in a Next.js route handler (`POST /api/vouchers/:id/extract`), triggered right after upload. The staff confirm screen shows "Reading…" and then fills the fields.
- One call per voucher, with all its photos (up to 4 pages).
- The prompt includes the voucher type, today's date, the list of active expense heads (code, name and hints), and known vendors.
- The model must return **only** JSON matching this schema (validate with zod; retry once on bad JSON):

```json
{
  "document_kind": "handwritten_slip | printed_invoice | cheque | upi_screenshot | card_slip | other",
  "date": "YYYY-MM-DD | null",
  "vendor_name": "string | null",
  "vendor_gstin": "string | null",
  "invoice_number": "string | null",
  "line_items": [{ "description": "string", "qty": "number|null", "rate": "number|null", "amount": "number" }],
  "taxable_value": "number | null",
  "cgst": "number | null",
  "sgst": "number | null",
  "igst": "number | null",
  "total_amount": "number | null",
  "payment_mode": "cash | upi | cheque | bank_transfer | card | null",
  "cheque_number": "string | null",
  "upi_reference": "string | null",
  "suggested_head_code": "string",
  "confidence": { "<field>": 0.0 },
  "notes": "anything unclear, e.g. 'amount could be 450 or 750'"
}
```

**Checks after extraction (server):**
- GSTIN: validate the format and checksum. State code `29` (Karnataka) means CGST+SGST is expected; any other state means IGST.
- Check that taxable value + taxes ≈ total (±₹1). Otherwise flag `amount_mismatch`.
- A date more than 30 days old or in the future gets flagged.
- Duplicates: flag if the same vendor + invoice number exists, the same image hash exists, or the same amount + vendor + date exists within 3 days.
- Any field with confidence < 0.8 is highlighted in the review UI.

**Choosing the expense head (in order):**
1. If the vendor is known and has a default head, use it.
2. If keywords in the line items match a head's `hints`, use it.
3. Otherwise use the LLM's `suggested_head_code`.

When Accounts changes the head, store the correction in `head_corrections`. After 3 corrections to the same head for the same vendor, set it as that vendor's default. This is how it "learns".

Raw model output is kept in `ai_extractions` for debugging and accuracy tracking.

---

## 6. Starter expense heads

Seed these. Admin can add, rename or deactivate them later. Each will map to a Tally ledger in Stage C (`tally_ledger_name` is blank for now).

| Code | Head | Group | Hints (keywords) |
|---|---|---|---|
| FB-PROV | Provisions & groceries | F&B purchases | rice, dal, atta, oil, masala, sugar |
| FB-VEG | Vegetables & fruits | F&B purchases | onion, tomato, vegetables, fruits, sabzi |
| FB-DAIRY | Milk & dairy | F&B purchases | milk, curd, paneer, butter, ghee |
| FB-MEAT | Meat, fish & eggs | F&B purchases | chicken, mutton, fish, eggs |
| FB-BEV | Beverages | F&B purchases | water bottles, soft drinks, tea, coffee |
| HK-SUP | Housekeeping supplies | Operating | phenyl, detergent, mop, garbage bags |
| HK-AMEN | Guest amenities | Operating | soap, shampoo, toothbrush, dental kit, slippers |
| HK-LAUN | Laundry & linen | Operating | laundry, dhobi, bedsheet, towel |
| RM-ELEC | Repairs: electrical | Repairs & maintenance | electrician, wire, bulb, switch, MCB |
| RM-PLUMB | Repairs: plumbing | Repairs & maintenance | plumber, tap, pipe, flush |
| RM-BLDG | Repairs: building & civil | Repairs & maintenance | paint, mason, carpenter, tiles |
| RM-EQP | Repairs: equipment & AC | Repairs & maintenance | AC service, fridge, lift, geyser |
| UT-POWER | Electricity | Utilities | BESCOM, electricity |
| UT-WATER | Water | Utilities | water tanker, BWSSB |
| UT-GAS | Gas / LPG | Utilities | LPG, cylinder, gas |
| UT-DSL | Diesel (generator) | Utilities | diesel, DG |
| ADM-STAT | Printing & stationery | Administrative | stationery, printing, pen, register |
| ADM-COUR | Postage & courier | Administrative | courier, speed post |
| ADM-TEL | Telephone & internet | Administrative | recharge, broadband, Airtel, Jio |
| ADM-CONV | Travel & conveyance | Administrative | auto, cab, Uber, Ola, bus |
| ADM-FUEL | Vehicle fuel | Administrative | petrol, fuel |
| STF-WELF | Staff welfare | Staff | staff tea, festival, medical |
| STF-FOOD | Staff food | Staff | staff meals |
| SEC-PEST | Cleaning & pest control | Operating | pest control, deep cleaning |
| SEC-SEC | Security | Operating | security guard |
| MKT-ADV | Advertising & promotion | Sales & marketing | flex, banner, ads |
| FIN-BANK | Bank charges | Finance | bank charges |
| MISC | Miscellaneous | Other | (fallback; review flags if > ₹2,000) |

Income-side heads for receipts and collections: `INC-ROOM` Room revenue, `INC-FB` F&B sales, `INC-OTH` Other income.

---

## 7. Database (Supabase / Postgres)

All tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, and `updated_at` where the row is editable.

```
departments      (name, active)
staff            (auth_user_id → auth.users, username unique, full_name, role enum, department_id, phone, active)
expense_heads    (code unique, name, group_name, hints text[], direction enum[out,in], tally_ledger_name, active, sort_order)
vendors          (name, gstin, phone, default_head_id, tally_ledger_name, active)
cash_floats      (department_id, name, opening_amount, current_balance, custodian_staff_id)
float_topups     (float_id, amount, date, given_by, note)
vouchers         (voucher_no text unique  -- e.g. HG-2611-0042 (YYMM + running no)
                  type enum, status enum, department_id, created_by, float_id null,
                  voucher_date date, vendor_id null, vendor_name_raw, head_id,
                  payment_mode enum, cheque_number, cheque_date, cheque_bank, upi_reference,
                  invoice_number, vendor_gstin,
                  taxable_value numeric(12,2), cgst, sgst, igst, total_amount numeric(12,2) not null default 0,
                  line_items jsonb, staff_note, accounts_note,
                  flags text[]  -- amount_mismatch, duplicate_suspect, low_confidence, old_date
                  reviewed_by, reviewed_at,
                  -- reserved for later stages:
                  approval_required bool default false, approval_state jsonb,
                  tally_status enum[not_sent,queued,posted,error] default 'not_sent', tally_voucher_id, tally_error)
voucher_images   (voucher_id, storage_path, sha256, width, height, page_no)
ai_extractions   (voucher_id, provider, model, raw_json jsonb, latency_ms, cost_estimate_inr, created_at)
head_corrections (voucher_id, vendor_id, from_head_id, to_head_id, corrected_by)
collections      (date, department_id, cash numeric, card numeric, upi numeric, other numeric, note, entered_by)  unique(date, department_id)
audit_log        (entity, entity_id, action, actor_staff_id, before jsonb, after jsonb, at)
```

**Petty cash floats:** approving a `petty_cash_expense` lowers its float's balance, and a top-up raises it. If the float would go negative, show a warning (but don't block).

**RLS:**
- `staff`: select and insert their own vouchers. They can update their own vouchers only while the status is `draft` or `queried`.
- `accounts` and `admin`: full read and update on vouchers. `admin` alone can write the masters.
- Storage bucket `voucher-images` is private. Images are served through short-lived signed URLs.

---

## 8. Screens

**Staff (phone)**
1. **Login:** name picker + PIN pad.
2. **Home:** a big "New voucher" button, my vouchers today, and items needing my reply (queried).
3. **New voucher:** choose type → camera (multiple pages, retake) → upload progress.
4. **Confirm:** photo thumbnail plus the extracted amount, date, vendor, head and payment mode, all editable. Then Submit. Can be saved as a draft if offline; it retries the upload when back online.
5. **My vouchers:** list with status chips, and a detail view with the query thread.

**Accounts (phone or desktop)**
6. **Review queue:** sorted oldest first, with filters by flag, department and type. Badges for duplicates and mismatches.
7. **Review screen:** zoomable photo on the left and all fields on the right. Low-confidence fields are outlined. Actions are Approve, Save & approve, Query (with a note), and Reject (with a reason). Keyboard shortcuts on desktop.
8. **Daily collections:** cash, card and UPI per department per day.
9. **Vendors:** list and edit (GSTIN, default head).

**Admin (owner)**
10. **Dashboard** (see §9).
11. **Masters:** staff and PIN reset, departments, expense heads, cash floats and top-ups.
12. **Voucher search and export:** filter by any field and export to CSV.

---

## 9. Dashboard (v1 standard view)

Updates live via Supabase Realtime. The default range is **today**, with toggles for yesterday, this week, this month and a custom range. All times are IST.

- **Top tiles:** spend today, spend month-to-date (vs the same days last month), collections today (cash / card / UPI), vouchers pending review (count and oldest age).
- **Spend by expense head:** horizontal bars for the selected range.
- **Spend by department:** Front Office / Store / Accounts.
- **Payment mode split:** cash / UPI / cheque / bank.
- **Daily trend:** last 30 days of spend vs collections.
- **Cash floats:** current balance per float, flagged when below a set threshold.
- **Top 10 vendors** by spend in the range.
- **Flag panel:** suspected duplicates, amount mismatches, and Miscellaneous entries over ₹2,000.
- **Recent vouchers:** the latest 20, with a click-through to detail and the photo.

Only approved vouchers count in spend totals. Submitted ones appear as "pending" in a separate figure.

---

## 10. Non-functional requirements

- **Phones:** works on low-end Android Chrome over 4G. Photo upload starts within 2 s of capture. Extraction finishes in under 15 s for typical vouchers.
- **Accuracy target** (measured on a test set of 50 real Hotel Geo vouchers): amount ≥ 95% exact, date ≥ 90%, head ≥ 85% correct before review. Track accuracy weekly from `head_corrections` and the fields edited at review.
- **Data safety:** daily Supabase backup on Pro (manual `pg_dump` script while on Free). Photos are never deleted, and voids are soft.
- **Money:** store `numeric(12,2)`, display in ₹ with Indian grouping (1,23,456.00).
- **Cost logging:** record the estimated AI cost per extraction, and show a monthly total on the admin page.

---

## 11. Build order (milestones)

1. **Setup:** repo, Next.js app, Supabase project, schema and migrations, seed data (departments, heads, an admin user), Vercel deploy. *Done when a "hello" page is live on Vercel and connected to the database.*
2. **Auth and roles:** PIN login, role-based navigation, RLS policies with tests.
3. **Capture:** camera, multi-page upload, compression, private storage, draft/submit.
4. **Extraction:** LLM module, schema validation, head suggestion, validation flags, confirm screen.
5. **Review:** queue, review screen, approve/query/reject, audit log, float balance updates.
6. **Collections and masters:** daily collections, vendors, heads, staff, floats.
7. **Dashboard:** all widgets in §9 with realtime updates.
8. **Hardening:** offline drafts, duplicate detection, CSV export, accuracy test on 50 real vouchers, PWA install.

Each milestone ends with a deploy to Vercel and a short check by the owner on a phone.

---

## 12. Inputs needed from Hotel Geo

- [ ] 30–50 photos of real past vouchers (mixed handwritten and printed) for testing accuracy.
- [ ] Staff list: names, departments, and who is Accounts.
- [ ] Current petty cash float amounts per department.
- [ ] Any changes to the starter expense heads.
- [ ] (For Stage C, not blocking) Tally version and ledger names, and the hotel software's name.

---

## 13. Kickoff prompt for Claude Code

> Read `docs/stage-a-spec.md`. Set up milestone 1: a Next.js + TypeScript + Tailwind app, Supabase schema as SQL migrations in `supabase/migrations`, seed data from §6, and a `CLAUDE.md` with run/test/deploy commands. Stop after milestone 1 and show me what to click in Supabase and Vercel to connect it.
