-- Milestone 2: role helpers, Row Level Security policies (spec §7) and PIN-login support (spec §2).
--
-- Roles: staff < accounts < admin.
--   staff:    own vouchers (create for own department; edit only while draft/queried)
--   accounts: everything staff can, plus read/update every voucher, vendors, collections
--   admin:    everything, plus masters (staff, departments, heads, floats) and voiding
--
-- Writes that need elevated rights (auth user management, AI extraction, PIN lockout counters)
-- run on the server with the service-role key, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
-- false = the Supabase password is still the raw PIN (e.g. the admin created by hand in the
-- dashboard). The app upgrades it to a server-derived password on the next successful login.
alter table public.staff add column pin_derived boolean not null default false;

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so policies can read staff without recursing into its RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s where s.auth_user_id = auth.uid() and s.active
$$;

create or replace function public.current_staff_department_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.department_id from public.staff s where s.auth_user_id = auth.uid() and s.active
$$;

create or replace function public.is_accounts_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('accounts', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() = 'admin', false)
$$;

revoke execute on function public.current_staff_role()          from public, anon;
revoke execute on function public.current_staff_department_id() from public, anon;
revoke execute on function public.is_accounts_or_admin()        from public, anon;
revoke execute on function public.is_admin()                    from public, anon;
grant  execute on function public.current_staff_role()          to authenticated;
grant  execute on function public.current_staff_department_id() to authenticated;
grant  execute on function public.is_accounts_or_admin()        to authenticated;
grant  execute on function public.is_admin()                    to authenticated;

-- ---------------------------------------------------------------------------
-- Policies. `(select fn())` lets Postgres evaluate the helper once per statement.
-- No DELETE policies anywhere: photos are never deleted and voids are soft (spec §10).
-- ---------------------------------------------------------------------------

-- departments / expense_heads: every active staff member reads; admin writes.
create policy departments_read on public.departments
  for select to authenticated using ((select public.current_staff_id()) is not null);
create policy departments_admin_insert on public.departments
  for insert to authenticated with check ((select public.is_admin()));
create policy departments_admin_update on public.departments
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy expense_heads_read on public.expense_heads
  for select to authenticated using ((select public.current_staff_id()) is not null);
create policy expense_heads_admin_insert on public.expense_heads
  for insert to authenticated with check ((select public.is_admin()));
create policy expense_heads_admin_update on public.expense_heads
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- staff: everyone reads their own row; accounts/admin read all; admin writes.
create policy staff_read on public.staff
  for select to authenticated
  using (auth_user_id = auth.uid() or (select public.is_accounts_or_admin()));
create policy staff_admin_insert on public.staff
  for insert to authenticated with check ((select public.is_admin()));
create policy staff_admin_update on public.staff
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- vendors: everyone reads (vendor names show on vouchers); accounts/admin manage.
create policy vendors_read on public.vendors
  for select to authenticated using ((select public.current_staff_id()) is not null);
create policy vendors_manage_insert on public.vendors
  for insert to authenticated with check ((select public.is_accounts_or_admin()));
create policy vendors_manage_update on public.vendors
  for update to authenticated
  using ((select public.is_accounts_or_admin())) with check ((select public.is_accounts_or_admin()));

-- cash_floats: staff read their department's floats; accounts/admin read all; admin writes.
create policy cash_floats_read on public.cash_floats
  for select to authenticated
  using ((select public.is_accounts_or_admin())
         or department_id = (select public.current_staff_department_id()));
create policy cash_floats_admin_insert on public.cash_floats
  for insert to authenticated with check ((select public.is_admin()));
create policy cash_floats_admin_update on public.cash_floats
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- float_topups: accounts/admin read; admin records top-ups.
create policy float_topups_read on public.float_topups
  for select to authenticated using ((select public.is_accounts_or_admin()));
create policy float_topups_admin_insert on public.float_topups
  for insert to authenticated with check ((select public.is_admin()));

-- vouchers
create policy vouchers_read on public.vouchers
  for select to authenticated
  using (created_by = (select public.current_staff_id()) or (select public.is_accounts_or_admin()));

create policy vouchers_insert on public.vouchers
  for insert to authenticated
  with check (
    created_by = (select public.current_staff_id())
    and (
      (select public.is_accounts_or_admin())
      or (department_id = (select public.current_staff_department_id())
          and status in ('draft', 'submitted'))
    )
  );

create policy vouchers_update on public.vouchers
  for update to authenticated
  using (
    (select public.is_accounts_or_admin())
    or (created_by = (select public.current_staff_id()) and status in ('draft', 'queried'))
  )
  with check (
    (select public.is_accounts_or_admin())
    or (created_by = (select public.current_staff_id()) and status in ('draft', 'submitted', 'queried'))
  );

-- voucher_images: visible with the voucher; added while the voucher is editable by the caller.
create policy voucher_images_read on public.voucher_images
  for select to authenticated
  using (exists (select 1 from public.vouchers v where v.id = voucher_id));  -- vouchers RLS applies
create policy voucher_images_insert on public.voucher_images
  for insert to authenticated
  with check (exists (
    select 1 from public.vouchers v
     where v.id = voucher_id
       and ((select public.is_accounts_or_admin())
            or (v.created_by = (select public.current_staff_id()) and v.status in ('draft', 'queried')))
  ));

-- ai_extractions: written by the server (service role); accounts/admin read for review/debugging.
create policy ai_extractions_read on public.ai_extractions
  for select to authenticated using ((select public.is_accounts_or_admin()));

-- head_corrections: accounts/admin.
create policy head_corrections_read on public.head_corrections
  for select to authenticated using ((select public.is_accounts_or_admin()));
create policy head_corrections_insert on public.head_corrections
  for insert to authenticated
  with check ((select public.is_accounts_or_admin()) and corrected_by = (select public.current_staff_id()));

-- collections: accounts/admin.
create policy collections_read on public.collections
  for select to authenticated using ((select public.is_accounts_or_admin()));
create policy collections_insert on public.collections
  for insert to authenticated
  with check ((select public.is_accounts_or_admin()) and entered_by = (select public.current_staff_id()));
create policy collections_update on public.collections
  for update to authenticated
  using ((select public.is_accounts_or_admin())) with check ((select public.is_accounts_or_admin()));

-- audit_log: written only by triggers. Accounts/admin read all; staff read their own vouchers' history.
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (
    (select public.is_accounts_or_admin())
    or (entity = 'vouchers'
        and exists (select 1 from public.vouchers v
                     where v.id = entity_id and v.created_by = (select public.current_staff_id())))
  );

-- ---------------------------------------------------------------------------
-- Column/transition rules RLS can't express. Applies only to logged-in API callers;
-- the service role and SQL editor (auth.uid() is null) are trusted server code.
-- ---------------------------------------------------------------------------
create or replace function public.guard_voucher_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.current_staff_role();
  if v_role is null then
    raise exception 'not an active staff member' using errcode = '42501';
  end if;

  -- Voiding is admin-only, for every role (spec §2).
  if new.status = 'void' and (tg_op = 'INSERT' or old.status is distinct from 'void') and v_role <> 'admin' then
    raise exception 'only admin can void a voucher' using errcode = '42501';
  end if;

  if v_role in ('accounts', 'admin') then
    return new;
  end if;

  -- From here on: plain staff.
  if tg_op = 'INSERT' then
    if new.reviewed_by is not null or new.reviewed_at is not null or new.accounts_note is not null
       or new.flags <> '{}' or new.tally_status <> 'not_sent' or new.tally_voucher_id is not null
       or new.approval_required or new.approval_state is not null then
      raise exception 'staff cannot set review, flag, approval or Tally fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.created_by     is distinct from old.created_by
     or new.voucher_no    is distinct from old.voucher_no
     or new.department_id is distinct from old.department_id
     or new.reviewed_by   is distinct from old.reviewed_by
     or new.reviewed_at   is distinct from old.reviewed_at
     or new.accounts_note is distinct from old.accounts_note
     or new.flags         is distinct from old.flags
     or new.approval_required is distinct from old.approval_required
     or new.approval_state    is distinct from old.approval_state
     or new.tally_status      is distinct from old.tally_status
     or new.tally_voucher_id  is distinct from old.tally_voucher_id
     or new.tally_error       is distinct from old.tally_error then
    raise exception 'staff cannot change that field' using errcode = '42501';
  end if;

  -- Allowed staff transitions: draft → draft/submitted, queried → queried/submitted.
  if not ((old.status = 'draft'   and new.status in ('draft', 'submitted'))
       or (old.status = 'queried' and new.status in ('queried', 'submitted'))) then
    raise exception 'staff cannot move a voucher from % to %', old.status, new.status using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_voucher_write() from public, anon, authenticated;

create trigger vouchers_guard
  before insert or update on public.vouchers
  for each row execute function public.guard_voucher_write();

-- ---------------------------------------------------------------------------
-- PIN lockout (spec §2: lock for 15 minutes after 5 wrong PINs).
-- Called only by the login server code with the service-role key.
-- ---------------------------------------------------------------------------
create or replace function public.register_failed_pin(p_staff_id uuid)
returns table (attempts integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.staff s
     set failed_pin_attempts = case when s.failed_pin_attempts + 1 >= 5 then 0
                                    else s.failed_pin_attempts + 1 end,
         locked_until        = case when s.failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes'
                                    else s.locked_until end
   where s.id = p_staff_id
  returning s.failed_pin_attempts, s.locked_until;
end;
$$;

create or replace function public.reset_failed_pins(p_staff_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.staff set failed_pin_attempts = 0, locked_until = null where id = p_staff_id
$$;

revoke execute on function public.register_failed_pin(uuid) from public, anon, authenticated;
revoke execute on function public.reset_failed_pins(uuid)   from public, anon, authenticated;
grant  execute on function public.register_failed_pin(uuid) to service_role;
grant  execute on function public.reset_failed_pins(uuid)   to service_role;
