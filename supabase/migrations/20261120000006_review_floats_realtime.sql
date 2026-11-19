-- Milestones 5–7: cash float balances follow approvals and top-ups, vendors learn a default head
-- from review corrections, and the dashboard gets live updates.

-- ---------------------------------------------------------------------------
-- Float balance (spec §7): approving a petty_cash_expense lowers its float; un-approving it
-- (void) or editing an approved one adjusts it back. Top-ups raise the float.
-- Negative balances are allowed; the app warns instead of blocking.
-- ---------------------------------------------------------------------------
create or replace function public.apply_float_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'approved' and old.type = 'petty_cash_expense' and old.float_id is not null then
    update public.cash_floats set current_balance = current_balance + old.total_amount where id = old.float_id;
  end if;
  if new.status = 'approved' and new.type = 'petty_cash_expense' and new.float_id is not null then
    update public.cash_floats set current_balance = current_balance - new.total_amount where id = new.float_id;
  end if;
  return new;
end;
$$;

create trigger vouchers_float_balance
  after insert or update of status, type, float_id, total_amount on public.vouchers
  for each row execute function public.apply_float_balance();

create or replace function public.apply_float_topup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cash_floats set current_balance = current_balance + new.amount where id = new.float_id;
  return new;
end;
$$;

create trigger float_topups_balance
  after insert on public.float_topups
  for each row execute function public.apply_float_topup();

-- ---------------------------------------------------------------------------
-- Head learning (spec §5): after 3 corrections to the same head for the same vendor, that head
-- becomes the vendor's default.
-- ---------------------------------------------------------------------------
create or replace function public.learn_vendor_head()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendor_id is not null
     and (select count(*) from public.head_corrections c
           where c.vendor_id = new.vendor_id and c.to_head_id = new.to_head_id) >= 3 then
    update public.vendors set default_head_id = new.to_head_id
     where id = new.vendor_id and default_head_id is distinct from new.to_head_id;
  end if;
  return new;
end;
$$;

create trigger head_corrections_learn
  after insert on public.head_corrections
  for each row execute function public.learn_vendor_head();

revoke execute on function public.apply_float_balance() from public, anon, authenticated;
revoke execute on function public.apply_float_topup()   from public, anon, authenticated;
revoke execute on function public.learn_vendor_head()   from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime for the dashboard (spec §9). RLS still decides who receives which rows.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.vouchers, public.collections, public.cash_floats;
