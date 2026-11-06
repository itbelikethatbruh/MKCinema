-- MKCinema backend: every database object the app uses. Safe to run more than once.
-- Run in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- Then deploy the two relays in supabase/functions (debrid-relay, mal-relay) with "Verify JWT" OFF:
--   supabase functions deploy debrid-relay --no-verify-jwt
--   supabase functions deploy mal-relay --no-verify-jwt
-- If your project's publishable key is not the built-in one, add it as the function secret MKC_RELAY_KEYS.
--
-- Objects: mkcinema_profiles (cloud sync), mkcinema_logs (Send log), mkcinema_log_rate (Send log limits),
-- mkcinema_is_owner() (who may read logs), mkcinema_delete_me() (Delete account), mkcinema_logs_guard() (trigger).

begin;

-- ---------------------------------------------------------------- cloud sync: one row per signed-in user
create table if not exists public.mkcinema_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mkcinema_profiles enable row level security;

-- Each user can only see and change their own row. There is deliberately no DELETE policy:
-- deleting goes through mkcinema_delete_me().
drop policy if exists "mkcinema: read own"   on public.mkcinema_profiles;
drop policy if exists "mkcinema: insert own" on public.mkcinema_profiles;
drop policy if exists "mkcinema: update own" on public.mkcinema_profiles;
create policy "mkcinema: read own"   on public.mkcinema_profiles for select using (auth.uid() = user_id);
create policy "mkcinema: insert own" on public.mkcinema_profiles for insert with check (auth.uid() = user_id);
create policy "mkcinema: update own" on public.mkcinema_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- the owner (reads logs in logs.html)
-- Replace the uuid with your own user id (Authentication > Users) before running on your own project.
create or replace function public.mkcinema_is_owner()
returns boolean
language sql
stable
set search_path = ''
as $function$ select auth.uid() = 'fd0f579d-ad6b-40bc-a246-1b0e47fad70a'::uuid $function$;

-- ---------------------------------------------------------------- Send log
create table if not exists public.mkcinema_logs (
  code        text primary key,
  created_at  timestamptz not null default now(),
  app_version text,
  platform    text,
  payload     jsonb not null
);
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'mkcinema_logs_code_check' and conrelid = 'public.mkcinema_logs'::regclass) then
    alter table public.mkcinema_logs add constraint mkcinema_logs_code_check check (code ~ '^[A-HJ-NP-Z2-9]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mkcinema_logs_app_version_check' and conrelid = 'public.mkcinema_logs'::regclass) then
    alter table public.mkcinema_logs add constraint mkcinema_logs_app_version_check check (char_length(app_version) <= 32);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mkcinema_logs_platform_check' and conrelid = 'public.mkcinema_logs'::regclass) then
    alter table public.mkcinema_logs add constraint mkcinema_logs_platform_check check (char_length(platform) <= 32);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mkcinema_logs_payload_check' and conrelid = 'public.mkcinema_logs'::regclass) then
    alter table public.mkcinema_logs add constraint mkcinema_logs_payload_check check (pg_column_size(payload) <= 200000);
  end if;
end $do$;
create index if not exists mkcinema_logs_created_at on public.mkcinema_logs (created_at desc);
alter table public.mkcinema_logs enable row level security;

-- anyone may add a log (limited by the guard below); only the owner may read or delete
revoke all on table public.mkcinema_logs from anon, authenticated;
grant insert on table public.mkcinema_logs to anon;
grant insert, select, delete on table public.mkcinema_logs to authenticated;
drop policy if exists "mkcinema_logs insert only"   on public.mkcinema_logs;
drop policy if exists "mkcinema_logs_owner_read"    on public.mkcinema_logs;
drop policy if exists "mkcinema_logs_owner_delete"  on public.mkcinema_logs;
create policy "mkcinema_logs insert only"  on public.mkcinema_logs for insert to anon, authenticated with check (true);
create policy "mkcinema_logs_owner_read"   on public.mkcinema_logs for select to authenticated using (public.mkcinema_is_owner());
create policy "mkcinema_logs_owner_delete" on public.mkcinema_logs for delete to authenticated using (public.mkcinema_is_owner());

-- Send log limits: counters only the guard touches
create table if not exists public.mkcinema_log_rate (
  bucket     text primary key,
  n          integer not null default 0,
  expires_at timestamptz not null
);
alter table public.mkcinema_log_rate enable row level security;
revoke all on table public.mkcinema_log_rate from public, anon, authenticated;
drop policy if exists "mkcinema_log_rate no access" on public.mkcinema_log_rate;
create policy "mkcinema_log_rate no access" on public.mkcinema_log_rate as restrictive for all to anon, authenticated using (false) with check (false);

-- Every API insert passes this guard: per IP at most 5 logs per 10 minutes and 20 a day, at most 30 an hour and
-- 150 a day overall, and nothing once the table passes 150 MB (HTTP 429). Logs older than 30 days are removed.
create or replace function public.mkcinema_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  hdr   jsonb;
  claims jsonb;
  ip    text;
  t     timestamptz := pg_catalog.now();
  e     double precision := extract(epoch from pg_catalog.now());
  got   integer;
  hour_n integer;
  lim   record;
begin
  -- the server decides when a log was made, so a client cannot keep one forever or hide it from cleanup
  new.created_at := t;

  hdr    := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
  claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
  -- only API (PostgREST) inserts are limited; SQL editor, migrations and service_role are not
  if hdr is null or coalesce(claims ->> 'role', '') = 'service_role' then return new; end if;

  if pg_catalog.pg_total_relation_size('public.mkcinema_logs'::regclass) > 150 * 1024 * 1024 then
    raise exception using errcode = 'PT429', message = 'The log store is full right now. Try again tomorrow.';
  end if;

  ip := coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(hdr ->> 'x-real-ip', ''),
                 nullif(pg_catalog.btrim(pg_catalog.split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
  ip := pg_catalog.md5('mkc-log:' || ip);

  for lim in
    select * from (values
      ('ip10m:' || ip || ':' || pg_catalog.floor(e / 600)::bigint,   5, 600),
      ('ipday:' || ip || ':' || pg_catalog.floor(e / 86400)::bigint, 20, 86400),
      ('all1h:' ||              pg_catalog.floor(e / 3600)::bigint,  30, 3600),
      ('allday:' ||             pg_catalog.floor(e / 86400)::bigint, 150, 86400)
    ) as v(bucket, max_n, secs)
  loop
    insert into public.mkcinema_log_rate as r (bucket, n, expires_at)
    values (lim.bucket, 1, t + pg_catalog.make_interval(secs => lim.secs))
    on conflict (bucket) do update set n = r.n + 1
    returning r.n into got;
    if got > lim.max_n then
      raise exception using errcode = 'PT429', message = 'Too many logs sent. Try again later.';
    end if;
    if lim.bucket like 'all1h:%' then hour_n := got; end if;
  end loop;

  -- housekeeping, at most once an hour (first accepted log of the hour)
  if hour_n = 1 then
    delete from public.mkcinema_log_rate where expires_at < t;
    delete from public.mkcinema_logs where created_at < t - interval '30 days';
  end if;
  return new;
end $function$;
revoke all on function public.mkcinema_logs_guard() from public, anon, authenticated;
drop trigger if exists mkcinema_logs_guard on public.mkcinema_logs;
create trigger mkcinema_logs_guard
  before insert on public.mkcinema_logs
  for each row execute function public.mkcinema_logs_guard();

-- ---------------------------------------------------------------- Delete account
-- Deletes the caller's synced data, then their login. Returns 'account', or 'data' if the login could not be removed.
create or replace function public.mkcinema_delete_me()
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.mkcinema_profiles where user_id = uid;
  begin
    delete from auth.users where id = uid;
  exception when others then
    return 'data';
  end;
  return 'account';
end $function$;
revoke all on function public.mkcinema_delete_me() from public, anon;
grant execute on function public.mkcinema_delete_me() to authenticated, service_role;

commit;
