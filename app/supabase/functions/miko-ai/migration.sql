-- Miko shared AI relay: daily request counters (no IPs stored, only salted hashes), callable only by the service role.
create table if not exists public.miko_ai_usage (
  bucket text not null,
  day date not null default (now() at time zone 'utc')::date,
  n integer not null default 0,
  primary key (bucket, day)
);
alter table public.miko_ai_usage enable row level security;
revoke all on public.miko_ai_usage from anon, authenticated;

-- adds one hit to each bucket for today and returns the new counts, in the order given
create or replace function public.miko_ai_hit(buckets text[])
returns integer[]
language plpgsql
security definer
set search_path = public
as $$
declare out integer[] := '{}'; b text; c integer;
begin
  delete from public.miko_ai_usage where day < (now() at time zone 'utc')::date - 2;
  foreach b in array buckets loop
    insert into public.miko_ai_usage as u (bucket, day, n) values (b, (now() at time zone 'utc')::date, 1)
      on conflict (bucket, day) do update set n = u.n + 1
      returning u.n into c;
    out := out || c;
  end loop;
  return out;
end $$;
revoke all on function public.miko_ai_hit(text[]) from public, anon, authenticated;
grant execute on function public.miko_ai_hit(text[]) to service_role;
