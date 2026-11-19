-- Suspense vouchers are settled by one or more purchase vouchers that point back to them.
alter table public.vouchers add column suspense_id uuid references public.vouchers (id);
create index vouchers_suspense_idx on public.vouchers (suspense_id) where suspense_id is not null;

-- Float balance now follows every approved money-out voucher paid from a float (purchase,
-- suspense, legacy petty cash). Purchases that settle a suspense voucher never touch a float:
-- the suspense voucher already took the cash out.
create or replace function public.apply_float_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'approved' and old.float_id is not null and old.suspense_id is null then
    update public.cash_floats set current_balance = current_balance + old.total_amount where id = old.float_id;
  end if;
  if new.status = 'approved' and new.float_id is not null and new.suspense_id is null then
    update public.cash_floats set current_balance = current_balance - new.total_amount where id = new.float_id;
  end if;
  return new;
end;
$$;

drop trigger vouchers_float_balance on public.vouchers;
create trigger vouchers_float_balance
  after insert or update of status, type, float_id, total_amount, suspense_id on public.vouchers
  for each row execute function public.apply_float_balance();
