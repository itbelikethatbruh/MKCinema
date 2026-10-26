-- MKCinema cloud sync: one row per signed-in user.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
create table if not exists public.mkcinema_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mkcinema_profiles enable row level security;

-- Each user can only see and change their own row.
create policy "mkcinema: read own"   on public.mkcinema_profiles for select using (auth.uid() = user_id);
create policy "mkcinema: insert own" on public.mkcinema_profiles for insert with check (auth.uid() = user_id);
create policy "mkcinema: update own" on public.mkcinema_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
