-- MKCinema 2.21: in-app account deletion (Google Play policy) and a private log reader for the owner.
-- Paste into Supabase > SQL Editor > New query, then Run.
create or replace function public.mkcinema_delete_me() returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); shared boolean;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.mkcinema_profiles where user_id = uid;
  -- this Supabase project also hosts another app: never remove a login that app still uses
  select exists(select 1 from public.profiles where id = uid and couple_id is not null) into shared;
  if shared then return 'data'; end if;
  begin
    delete from auth.users where id = uid;
  exception when others then
    return 'data';
  end;
  return 'account';
end $$;
revoke all on function public.mkcinema_delete_me() from public, anon;
grant execute on function public.mkcinema_delete_me() to authenticated;

create or replace function public.mkcinema_is_owner() returns boolean
language sql stable as $$ select auth.uid() = 'fd0f579d-ad6b-40bc-a246-1b0e47fad70a'::uuid $$;

grant select, delete on public.mkcinema_logs to authenticated;
drop policy if exists mkcinema_logs_owner_read on public.mkcinema_logs;
create policy mkcinema_logs_owner_read on public.mkcinema_logs for select to authenticated using (public.mkcinema_is_owner());
drop policy if exists mkcinema_logs_owner_delete on public.mkcinema_logs;
create policy mkcinema_logs_owner_delete on public.mkcinema_logs for delete to authenticated using (public.mkcinema_is_owner());
