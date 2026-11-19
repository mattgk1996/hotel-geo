-- Hotel Geo Voucher & Expense App — Stage A core schema (spec §7).
-- Safe to run once on a fresh Supabase project. Later changes go in new migration files.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('staff', 'accounts', 'admin');

create type public.voucher_type as enum (
  'petty_cash_expense',
  'purchase_bill',
  'vendor_payment',
  'staff_advance',
  'cash_receipt',
  'sales_voucher',
  'collection'
);

-- Includes statuses reserved for Stage B (WhatsApp approval) and Stage C (Tally).
create type public.voucher_status as enum (
  'draft',
  'submitted',
  'queried',
  'approved',
  'rejected',
  'void',
  'pending_whatsapp_approval',
  'posted_to_tally',
  'tally_error'
);

create type public.payment_mode as enum (
  'cash', 'upi', 'cheque', 'bank_transfer', 'card', 'vendor_credit'
);

create type public.head_direction as enum ('out', 'in');

create type public.tally_status as enum ('not_sent', 'queued', 'posted', 'error');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Masters
-- ---------------------------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid unique references auth.users (id) on delete set null,
  username            text not null unique check (username ~ '^[a-z0-9._-]{2,32}$'),
  full_name           text not null,
  role                public.staff_role not null default 'staff',
  department_id       uuid references public.departments (id),
  phone               text,
  active              boolean not null default true,
  -- PIN lockout (spec §2: lock 15 min after 5 wrong PINs); used from milestone 2.
  failed_pin_attempts integer not null default 0,
  locked_until        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.expense_heads (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  group_name        text not null,
  hints             text[] not null default '{}',
  direction         public.head_direction not null default 'out',
  tally_ledger_name text,
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.vendors (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  gstin             text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  phone             text,
  default_head_id   uuid references public.expense_heads (id),
  tally_ledger_name text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index vendors_gstin_key on public.vendors (gstin) where gstin is not null;
create index vendors_name_idx on public.vendors (lower(name));

create table public.cash_floats (
  id                    uuid primary key default gen_random_uuid(),
  department_id         uuid not null references public.departments (id),
  name                  text not null,
  opening_amount        numeric(12,2) not null default 0,
  current_balance       numeric(12,2) not null default 0,
  low_balance_threshold numeric(12,2) not null default 0,  -- dashboard flag (spec §9)
  custodian_staff_id    uuid references public.staff (id),
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.float_topups (
  id         uuid primary key default gen_random_uuid(),
  float_id   uuid not null references public.cash_floats (id),
  amount     numeric(12,2) not null check (amount > 0),
  date       date not null default (now() at time zone 'Asia/Kolkata')::date,
  given_by   uuid references public.staff (id),
  note       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Vouchers
-- ---------------------------------------------------------------------------
-- Running number per IST month: HG-YYMM-NNNN.
create table public.voucher_counters (
  yymm    text primary key,
  last_no integer not null default 0
);

create table public.vouchers (
  id              uuid primary key default gen_random_uuid(),
  voucher_no      text not null unique,
  type            public.voucher_type not null,
  status          public.voucher_status not null default 'draft',
  department_id   uuid not null references public.departments (id),
  created_by      uuid not null references public.staff (id),
  float_id        uuid references public.cash_floats (id),
  voucher_date    date not null default (now() at time zone 'Asia/Kolkata')::date,
  vendor_id       uuid references public.vendors (id),
  vendor_name_raw text,
  head_id         uuid references public.expense_heads (id),
  payment_mode    public.payment_mode,
  cheque_number   text,
  cheque_date     date,
  cheque_bank     text,
  upi_reference   text,
  invoice_number  text,
  vendor_gstin    text,
  taxable_value   numeric(12,2),
  cgst            numeric(12,2),
  sgst            numeric(12,2),
  igst            numeric(12,2),
  total_amount    numeric(12,2) not null default 0,
  line_items      jsonb not null default '[]'::jsonb,
  staff_note      text,
  accounts_note   text,
  flags           text[] not null default '{}',  -- amount_mismatch, duplicate_suspect, low_confidence, old_date
  reviewed_by     uuid references public.staff (id),
  reviewed_at     timestamptz,
  -- Reserved for Stage B (WhatsApp approvals)
  approval_required boolean not null default false,
  approval_state    jsonb,
  -- Reserved for Stage C (Tally)
  tally_status      public.tally_status not null default 'not_sent',
  tally_voucher_id  text,
  tally_error       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index vouchers_status_created_idx on public.vouchers (status, created_at);
create index vouchers_created_by_idx on public.vouchers (created_by);
create index vouchers_department_date_idx on public.vouchers (department_id, voucher_date);
create index vouchers_voucher_date_idx on public.vouchers (voucher_date);
create index vouchers_vendor_invoice_idx on public.vouchers (vendor_id, invoice_number);
create index vouchers_head_idx on public.vouchers (head_id);

create or replace function public.assign_voucher_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yymm text := to_char(now() at time zone 'Asia/Kolkata', 'YYMM');
  v_no   integer;
begin
  if new.voucher_no is not null and new.voucher_no <> '' then
    return new;
  end if;
  insert into public.voucher_counters as c (yymm, last_no)
  values (v_yymm, 1)
  on conflict (yymm) do update set last_no = c.last_no + 1
  returning last_no into v_no;
  new.voucher_no := 'HG-' || v_yymm || '-' || lpad(v_no::text, 4, '0');
  return new;
end;
$$;

create trigger vouchers_assign_no
  before insert on public.vouchers
  for each row execute function public.assign_voucher_no();

create table public.voucher_images (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references public.vouchers (id),
  storage_path text not null unique,
  sha256       text not null,
  width        integer,
  height       integer,
  page_no      integer not null default 1 check (page_no between 1 and 4),
  created_at   timestamptz not null default now(),
  unique (voucher_id, page_no)
);
create index voucher_images_sha256_idx on public.voucher_images (sha256);

create table public.ai_extractions (
  id                uuid primary key default gen_random_uuid(),
  voucher_id        uuid not null references public.vouchers (id),
  provider          text not null,
  model             text not null,
  raw_json          jsonb,
  latency_ms        integer,
  cost_estimate_inr numeric(10,4),
  created_at        timestamptz not null default now()
);
create index ai_extractions_voucher_idx on public.ai_extractions (voucher_id);

create table public.head_corrections (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references public.vouchers (id),
  vendor_id    uuid references public.vendors (id),
  from_head_id uuid references public.expense_heads (id),
  to_head_id   uuid not null references public.expense_heads (id),
  corrected_by uuid references public.staff (id),
  created_at   timestamptz not null default now()
);
create index head_corrections_vendor_head_idx on public.head_corrections (vendor_id, to_head_id);

create table public.collections (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  department_id uuid not null references public.departments (id),
  cash          numeric(12,2) not null default 0,
  card          numeric(12,2) not null default 0,
  upi           numeric(12,2) not null default 0,
  other         numeric(12,2) not null default 0,
  note          text,
  entered_by    uuid references public.staff (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (date, department_id)
);

create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  entity         text not null,
  entity_id      uuid not null,
  action         text not null,
  actor_staff_id uuid references public.staff (id),
  before         jsonb,
  after          jsonb,
  at             timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger departments_updated_at   before update on public.departments   for each row execute function public.set_updated_at();
create trigger staff_updated_at         before update on public.staff         for each row execute function public.set_updated_at();
create trigger expense_heads_updated_at before update on public.expense_heads for each row execute function public.set_updated_at();
create trigger vendors_updated_at       before update on public.vendors       for each row execute function public.set_updated_at();
create trigger cash_floats_updated_at   before update on public.cash_floats   for each row execute function public.set_updated_at();
create trigger vouchers_updated_at      before update on public.vouchers      for each row execute function public.set_updated_at();
create trigger collections_updated_at   before update on public.collections   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit trail for vouchers (spec §4: every status change and field edit)
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff s where s.auth_user_id = auth.uid() and s.active
$$;

create or replace function public.audit_voucher_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
    v_after  := to_jsonb(new);
  else
    -- Only record the fields that changed (ignoring updated_at).
    select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, n.value)
      into v_before, v_after
      from jsonb_each(to_jsonb(old)) o
      join jsonb_each(to_jsonb(new)) n using (key)
     where o.value is distinct from n.value
       and o.key <> 'updated_at';
    if v_after is null then
      return new;
    end if;
    v_action := case when old.status is distinct from new.status
                     then 'status:' || old.status || '->' || new.status
                     else 'update' end;
  end if;
  insert into public.audit_log (entity, entity_id, action, actor_staff_id, before, after)
  values ('vouchers', new.id, v_action, public.current_staff_id(), v_before, v_after);
  return new;
end;
$$;

create trigger vouchers_audit
  after insert or update on public.vouchers
  for each row execute function public.audit_voucher_change();
