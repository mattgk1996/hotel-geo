-- Minimal stand-ins for the parts of Supabase that the migrations reference,
-- so they can run in plain Postgres (PGlite) during tests. Not used in production.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);
-- Supabase reads the caller's user id from the JWT; tests set it with set_config.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- Supabase Storage keeps file metadata here, with RLS on; policies decide who may upload/read.
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, service_role;
grant select, insert on storage.objects to authenticated;
