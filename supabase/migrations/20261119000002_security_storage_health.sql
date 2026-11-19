-- Locks every table down (RLS on, no policies yet = no access through the public API),
-- creates the private photo bucket, and adds a tiny health check for the "hello" page.
-- Role-based RLS policies (spec §7) arrive in milestone 2 together with PIN login.

-- ---------------------------------------------------------------------------
-- Row Level Security: deny by default
-- ---------------------------------------------------------------------------
alter table public.departments      enable row level security;
alter table public.staff            enable row level security;
alter table public.expense_heads    enable row level security;
alter table public.vendors          enable row level security;
alter table public.cash_floats      enable row level security;
alter table public.float_topups     enable row level security;
alter table public.voucher_counters enable row level security;
alter table public.vouchers         enable row level security;
alter table public.voucher_images   enable row level security;
alter table public.ai_extractions   enable row level security;
alter table public.head_corrections enable row level security;
alter table public.collections      enable row level security;
alter table public.audit_log        enable row level security;

-- The counter table is internal: only the voucher-number trigger touches it.
revoke all on public.voucher_counters from anon, authenticated;

-- Internal helper functions are not part of the public API.
revoke execute on function public.assign_voucher_no()    from public, anon, authenticated;
revoke execute on function public.audit_voucher_change() from public, anon, authenticated;
revoke execute on function public.current_staff_id()     from public, anon;
grant  execute on function public.current_staff_id()     to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket for voucher photos (served via short-lived signed URLs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voucher-images', 'voucher-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Health check used by the milestone-1 "hello" page. Returns only counts.
-- ---------------------------------------------------------------------------
create or replace function public.app_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'departments',   (select count(*) from public.departments where active),
    'expense_heads', (select count(*) from public.expense_heads where active),
    'admins',        (select count(*) from public.staff where role = 'admin' and active),
    'admins_linked', (select count(*) from public.staff where role = 'admin' and active and auth_user_id is not null),
    'db_time',       now()
  )
$$;

revoke execute on function public.app_health() from public;
grant  execute on function public.app_health() to anon, authenticated;
