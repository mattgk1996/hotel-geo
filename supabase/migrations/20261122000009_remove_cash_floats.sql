-- Owner decision (Nov 2026): cash floats are not used. Remove floats, top-ups and the balance triggers.
-- Safe to run whether or not migrations 6/8 were applied.
drop trigger if exists vouchers_float_balance on public.vouchers;
drop function if exists public.apply_float_balance();
drop table if exists public.float_topups;      -- also drops its trigger
drop function if exists public.apply_float_topup();
alter table public.vouchers drop column if exists float_id;
drop table if exists public.cash_floats;       -- also leaves the realtime publication
