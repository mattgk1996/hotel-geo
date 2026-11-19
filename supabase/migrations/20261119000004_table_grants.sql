-- Newer Supabase projects don't auto-grant table privileges to the API roles, so grant them
-- explicitly. RLS policies (migration 3) still decide which rows each user can touch.
-- anon gets no table access at all; it only needs public.app_health() (granted in migration 2).

grant usage on schema public to authenticated, service_role;

grant select, insert, update on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Internal counter: only the SECURITY DEFINER voucher-number trigger uses it.
revoke all on public.voucher_counters from anon, authenticated;

-- Tables created by later migrations get the same grants.
alter default privileges in schema public grant select, insert, update on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
