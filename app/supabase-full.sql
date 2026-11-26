-- MKCinema backend, full: every table, policy and function the live project uses (exported 2026-11-26).
-- SELF-HOSTING: mkcinema_is_owner() below names the owner's account id (fd0f579d-...). Replace it with your own
-- account's id (Authentication > Users in the Supabase dashboard) before running, or owner-only tools stay locked.
-- Run it once in a new Supabase project's SQL editor (it is safe to run again). app/supabase.sql is the short core
-- (accounts, profiles, logs); this file is a superset of it and also has the social hub, notes, kudos, cards,
-- Miko's built-in AI counters (miko_ai_usage / miko_ai_hit), the status notice, usage counts and the account format check.
-- It holds no data. Edge functions are in app/supabase/functions/ (deploy each with verify_jwt off).
set check_function_bodies = off;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- ---------- tables ----------
create table if not exists public.miko_ai_usage (
  bucket text not null,
  day date default ((now() AT TIME ZONE 'utc'::text))::date not null,
  n integer default 0 not null,
  constraint miko_ai_usage_pkey PRIMARY KEY (bucket, day)
);

create table if not exists public.mkc_cards (
  user_id uuid not null,
  bio text,
  favs jsonb default '[]'::jsonb not null,
  trophies jsonb default '{}'::jsonb not null,
  show_trophies boolean default true not null,
  share_activity boolean default false not null,
  stats jsonb,
  recent jsonb,
  updated_at timestamp with time zone default now() not null,
  mood text,
  mood_text text,
  mood_at timestamp with time zone,
  mood_until timestamp with time zone,
  constraint mkc_cards_pkey PRIMARY KEY (user_id),
  constraint mkc_cards_bio_check CHECK ((char_length(bio) <= 160)),
  constraint mkc_cards_favs_check CHECK (((jsonb_typeof(favs) = 'array'::text) AND (jsonb_array_length(favs) <= 4) AND (pg_column_size(favs) <= 4000))),
  constraint mkc_cards_mood_check CHECK ((mood = ANY (ARRAY['hyped'::text, 'chill'::text, 'cozy'::text, 'laughing'::text, 'crying'::text, 'scared'::text, 'mindblown'::text, 'bored'::text, 'sleepy'::text, 'hungry'::text, 'romantic'::text, 'angry'::text]))),
  constraint mkc_cards_mood_text_check CHECK ((char_length(mood_text) <= 80)),
  constraint mkc_cards_recent_check CHECK (((recent IS NULL) OR ((jsonb_typeof(recent) = 'array'::text) AND (jsonb_array_length(recent) <= 20) AND (pg_column_size(recent) <= 12000)))),
  constraint mkc_cards_stats_check CHECK (((stats IS NULL) OR (pg_column_size(stats) <= 2000))),
  constraint mkc_cards_trophies_check CHECK (((jsonb_typeof(trophies) = 'object'::text) AND (pg_column_size(trophies) <= 4000)))
);

create table if not exists public.mkc_friends (
  user_id uuid not null,
  other_id uuid not null,
  state text not null,
  created_at timestamp with time zone default now() not null,
  constraint mkc_friends_pkey PRIMARY KEY (user_id, other_id),
  constraint mkc_friends_check CHECK ((user_id <> other_id)),
  constraint mkc_friends_state_check CHECK ((state = ANY (ARRAY['out'::text, 'in'::text, 'friend'::text, 'blocked'::text])))
);

create table if not exists public.mkc_hub_notes (
  id bigint generated always as identity not null,
  user_id uuid not null,
  from_id uuid not null,
  kind text not null,
  post_id bigint not null,
  seen boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint mkc_hub_notes_pkey PRIMARY KEY (id),
  constraint mkc_hub_notes_kind_check CHECK ((kind = ANY (ARRAY['tag'::text, 'reply'::text, 'react'::text])))
);

create table if not exists public.mkc_kudos (
  giver uuid not null,
  taker uuid not null,
  kind text not null,
  created_at timestamp with time zone default now() not null,
  constraint mkc_kudos_pkey PRIMARY KEY (giver, taker, kind),
  constraint mkc_kudos_check CHECK ((giver <> taker)),
  constraint mkc_kudos_kind_check CHECK ((kind = ANY (ARRAY['taste'::text, 'host'::text, 'gem'::text, 'binge'::text, 'pal'::text])))
);

create table if not exists public.mkc_messages (
  id bigint generated always as identity not null,
  sender uuid not null,
  recipient uuid not null,
  kind text default 'text'::text not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  constraint mkc_messages_pkey PRIMARY KEY (id),
  constraint mkc_messages_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000))),
  constraint mkc_messages_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'party'::text, 'call'::text, 'title'::text])))
);

create table if not exists public.mkc_notes (
  id bigint generated always as identity not null,
  user_id uuid,
  kind text not null,
  body text not null,
  name text,
  app_version text,
  platform text,
  status text default 'new'::text not null,
  reply text,
  replied_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  constraint mkc_notes_pkey PRIMARY KEY (id),
  constraint mkc_notes_app_version_check CHECK ((char_length(app_version) <= 32)),
  constraint mkc_notes_body_check CHECK (((char_length(body) >= 3) AND (char_length(body) <= 2000))),
  constraint mkc_notes_kind_check CHECK ((kind = ANY (ARRAY['idea'::text, 'thanks'::text]))),
  constraint mkc_notes_name_check CHECK ((char_length(name) <= 40)),
  constraint mkc_notes_platform_check CHECK ((char_length(platform) <= 32)),
  constraint mkc_notes_reply_check CHECK ((char_length(reply) <= 600)),
  constraint mkc_notes_status_check CHECK ((status = ANY (ARRAY['new'::text, 'read'::text, 'planned'::text, 'done'::text, 'declined'::text])))
);

create table if not exists public.mkc_people (
  user_id uuid not null,
  username text not null,
  name text,
  avatar text,
  findable boolean default false not null,
  calls text default 'off'::text not null,
  created_at timestamp with time zone default now() not null,
  renamed_at timestamp with time zone default now() not null,
  constraint mkc_people_username_key UNIQUE (username),
  constraint mkc_people_pkey PRIMARY KEY (user_id),
  constraint mkc_people_avatar_check CHECK ((avatar ~ '^[a-z0-9-]{1,24}$'::text)),
  constraint mkc_people_calls_check CHECK ((calls = ANY (ARRAY['off'::text, 'idle'::text, 'on'::text]))),
  constraint mkc_people_name_check CHECK ((char_length(name) <= 32)),
  constraint mkc_people_username_check CHECK ((username ~ '^[a-z0-9_]{3,20}$'::text))
);

create table if not exists public.mkc_post_reports (
  post_id bigint not null,
  reporter uuid not null,
  author uuid not null,
  body text,
  reason text,
  created_at timestamp with time zone default now() not null,
  constraint mkc_post_reports_pkey PRIMARY KEY (post_id, reporter),
  constraint mkc_post_reports_reason_check CHECK ((char_length(reason) <= 500))
);

create table if not exists public.mkc_posts (
  id bigint generated always as identity not null,
  author uuid not null,
  parent bigint,
  body text not null,
  mood text,
  title jsonb,
  tags uuid[] default '{}'::uuid[] not null,
  reports integer default 0 not null,
  hidden boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint mkc_posts_pkey PRIMARY KEY (id),
  constraint mkc_posts_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500))),
  constraint mkc_posts_mood_check CHECK ((mood = ANY (ARRAY['hyped'::text, 'chill'::text, 'cozy'::text, 'laughing'::text, 'crying'::text, 'scared'::text, 'mindblown'::text, 'bored'::text, 'sleepy'::text, 'hungry'::text, 'romantic'::text, 'angry'::text]))),
  constraint mkc_posts_tags_check CHECK ((cardinality(tags) <= 10)),
  constraint mkc_posts_title_check CHECK (((title IS NULL) OR (pg_column_size(title) <= 900)))
);

create table if not exists public.mkc_presence (
  user_id uuid not null,
  online boolean default false not null,
  busy boolean default false not null,
  watching jsonb,
  seen_at timestamp with time zone default now() not null,
  constraint mkc_presence_pkey PRIMARY KEY (user_id),
  constraint mkc_presence_watching_check CHECK (((watching IS NULL) OR (pg_column_size(watching) <= 1500)))
);

create table if not exists public.mkc_public_stats (
  id integer default 1 not null,
  visits bigint default 0 not null,
  visits_per_hour numeric default 0 not null,
  site_downloads bigint default 0 not null,
  site_downloads_per_hour numeric default 0 not null,
  gh_downloads bigint default 0 not null,
  gh_stars integer default 0 not null,
  countries integer default 0 not null,
  snapshot_at timestamp with time zone default now() not null,
  constraint mkc_public_stats_pkey PRIMARY KEY (id),
  constraint mkc_public_stats_id_check CHECK ((id = 1))
);

create table if not exists public.mkc_reacts (
  post_id bigint not null,
  user_id uuid not null,
  emoji text not null,
  created_at timestamp with time zone default now() not null,
  constraint mkc_reacts_pkey PRIMARY KEY (post_id, user_id, emoji),
  constraint mkc_reacts_emoji_check CHECK ((emoji = ANY (ARRAY['fire'::text, 'lol'::text, 'cry'::text, 'wow'::text, 'love'::text, 'up'::text])))
);

create table if not exists public.mkc_reports (
  id bigint generated always as identity not null,
  reporter uuid not null,
  reported uuid not null,
  reason text,
  recent jsonb,
  created_at timestamp with time zone default now() not null,
  constraint mkc_reports_pkey PRIMARY KEY (id),
  constraint mkc_reports_reason_check CHECK ((char_length(reason) <= 500))
);

create table if not exists public.mkc_staff (
  user_id uuid not null,
  constraint mkc_staff_pkey PRIMARY KEY (user_id)
);

create table if not exists public.mkc_usage_daily (
  day date not null,
  ev text not null,
  k text not null,
  dev text default ''::text not null,
  lang text default ''::text not null,
  cc text default ''::text not null,
  n bigint default 0 not null,
  secs bigint default 0 not null,
  constraint mkc_usage_daily_pkey PRIMARY KEY (day, ev, k, dev, lang, cc)
);

create table if not exists public.mkcinema_log_rate (
  bucket text not null,
  n integer default 0 not null,
  expires_at timestamp with time zone not null,
  constraint mkcinema_log_rate_pkey PRIMARY KEY (bucket)
);

create table if not exists public.mkcinema_logs (
  code text not null,
  created_at timestamp with time zone default now() not null,
  app_version text,
  platform text,
  payload jsonb not null,
  constraint mkcinema_logs_pkey PRIMARY KEY (code),
  constraint mkcinema_logs_app_version_check CHECK ((char_length(app_version) <= 32)),
  constraint mkcinema_logs_code_check CHECK ((code ~ '^[A-HJ-NP-Z2-9]{6}$'::text)),
  constraint mkcinema_logs_payload_check CHECK ((pg_column_size(payload) <= 200000)),
  constraint mkcinema_logs_platform_check CHECK ((char_length(platform) <= 32))
);

create table if not exists public.mkcinema_notice (
  id smallint default 1 not null,
  text text default ''::text not null,
  updated_at timestamp with time zone default now() not null,
  constraint mkcinema_notice_pkey PRIMARY KEY (id),
  constraint mkcinema_notice_id_check CHECK ((id = 1)),
  constraint mkcinema_notice_text_check CHECK ((char_length(text) <= 200))
);

create table if not exists public.mkcinema_profiles (
  user_id uuid not null,
  data jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  constraint mkcinema_profiles_pkey PRIMARY KEY (user_id)
);


-- ---------- links between tables ----------
do $$ begin alter table public.mkc_cards add constraint mkc_cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_friends add constraint mkc_friends_other_id_fkey FOREIGN KEY (other_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_friends add constraint mkc_friends_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_hub_notes add constraint mkc_hub_notes_from_id_fkey FOREIGN KEY (from_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_hub_notes add constraint mkc_hub_notes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.mkc_posts(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_hub_notes add constraint mkc_hub_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_kudos add constraint mkc_kudos_giver_fkey FOREIGN KEY (giver) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_kudos add constraint mkc_kudos_taker_fkey FOREIGN KEY (taker) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_messages add constraint mkc_messages_recipient_fkey FOREIGN KEY (recipient) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_messages add constraint mkc_messages_sender_fkey FOREIGN KEY (sender) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_notes add constraint mkc_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_people add constraint mkc_people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_post_reports add constraint mkc_post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.mkc_posts(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_post_reports add constraint mkc_post_reports_reporter_fkey FOREIGN KEY (reporter) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_posts add constraint mkc_posts_author_fkey FOREIGN KEY (author) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_posts add constraint mkc_posts_parent_fkey FOREIGN KEY (parent) REFERENCES public.mkc_posts(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_presence add constraint mkc_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_reacts add constraint mkc_reacts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.mkc_posts(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_reacts add constraint mkc_reacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_reports add constraint mkc_reports_reported_fkey FOREIGN KEY (reported) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_reports add constraint mkc_reports_reporter_fkey FOREIGN KEY (reporter) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkc_staff add constraint mkc_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;
do $$ begin alter table public.mkcinema_profiles add constraint mkcinema_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; exception when duplicate_object then null; end $$;

-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.miko_ai_hit(buckets text[])
 RETURNS integer[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_account_format(p_email text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e text := lower(trim(coalesce(p_email, '')));
    m jsonb;
      fake text := rtrim(translate(encode(sha256(convert_to('mkcinema|' || e, 'UTF8')), 'base64'), '+/', '-_'), '=');
      begin
        if e = '' or length(e) > 320 then return json_build_object('v', 2, 's', fake); end if;
          select u.raw_user_meta_data into m from auth.users u where lower(u.email) = e limit 1;
            if not found then return json_build_object('v', 2, 's', fake); end if;
              if (m->>'mkc_kdf') = '2' then return json_build_object('v', 2, 's', coalesce(nullif(m->>'mkc_salt', ''), fake)); end if;
                return json_build_object('v', 1);
                end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_am_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.mkc_staff where user_id = auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.mkc_are_friends(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                      select exists (select 1 from public.mkc_friends f where f.user_id = a and f.other_id = b and f.state = 'friend')
                                                                           and exists (select 1 from public.mkc_friends f where f.user_id = b and f.other_id = a and f.state = 'friend');
                                                                           $function$
;
CREATE OR REPLACE FUNCTION public.mkc_block(other uuid, on_ boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                 declare uid uuid := auth.uid();
                                                                                                                                                                                                                                                                 begin
                                                                                                                                                                                                                                                                   if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                     if other is null or other = uid then raise exception 'Not possible'; end if;
                                                                                                                                                                                                                                                                       if on_ then
                                                                                                                                                                                                                                                                           insert into public.mkc_friends (user_id, other_id, state) values (uid, other, 'blocked')
                                                                                                                                                                                                                                                                                 on conflict (user_id, other_id) do update set state = 'blocked', created_at = now();
                                                                                                                                                                                                                                                                                     delete from public.mkc_friends where user_id = other and other_id = uid and state <> 'blocked';
                                                                                                                                                                                                                                                                                         return 'blocked';
                                                                                                                                                                                                                                                                                           end if;
                                                                                                                                                                                                                                                                                             delete from public.mkc_friends where user_id = uid and other_id = other and state = 'blocked';
                                                                                                                                                                                                                                                                                               return 'unblocked';
                                                                                                                                                                                                                                                                                               end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_blocked(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                              select exists (select 1 from public.mkc_friends f where f.state = 'blocked' and ((f.user_id = a and f.other_id = b) or (f.user_id = b and f.other_id = a)));
                                                              $function$
;
CREATE OR REPLACE FUNCTION public.mkc_card(other uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                        declare uid uuid := auth.uid(); p public.mkc_people; c public.mkc_cards; self boolean; k jsonb; gave jsonb;
                                                                                                                                                                                                        begin
                                                                                                                                                                                                          if uid is null or other is null then return null; end if;
                                                                                                                                                                                                            self := other = uid;
                                                                                                                                                                                                              if not self and not public.mkc_are_friends(uid, other) then return null; end if;
                                                                                                                                                                                                                select * into p from public.mkc_people where user_id = other;
                                                                                                                                                                                                                  if p.user_id is null then return null; end if;
                                                                                                                                                                                                                    select * into c from public.mkc_cards where user_id = other;
                                                                                                                                                                                                                      select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into k from (select kind, count(*) n from public.mkc_kudos where taker = other group by kind) t;
                                                                                                                                                                                                                        select coalesce(jsonb_agg(kind), '[]'::jsonb) into gave from public.mkc_kudos where giver = uid and taker = other;
                                                                                                                                                                                                                          return jsonb_build_object(
                                                                                                                                                                                                                              'id', p.user_id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'self', self,
                                                                                                                                                                                                                                  'bio', c.bio, 'favs', coalesce(c.favs, '[]'::jsonb),
                                                                                                                                                                                                                                      'show_trophies', coalesce(c.show_trophies, true), 'share', coalesce(c.share_activity, false),
                                                                                                                                                                                                                                          'trophies', case when self or coalesce(c.show_trophies, true) then coalesce(c.trophies, '{}'::jsonb) || public.mkc_srv_trophies(other) else '{}'::jsonb end,
                                                                                                                                                                                                                                              'kudos', case when self or coalesce(c.show_trophies, true) then k else '{}'::jsonb end,
                                                                                                                                                                                                                                                  'gave', case when self then '[]'::jsonb else gave end,
                                                                                                                                                                                                                                                      'stats', case when c.share_activity then c.stats end,
                                                                                                                                                                                                                                                          'recent', case when c.share_activity then c.recent end,
                                                                                                                                                                                                                                                              'updated', c.updated_at);
                                                                                                                                                                                                                                                              end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_card_set(p_bio text, p_favs jsonb, p_trophies jsonb, p_show_trophies boolean, p_share boolean, p_stats jsonb, p_recent jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                            declare uid uuid := auth.uid(); cur public.mkc_cards; b text;
                                                                                                                                                                            begin
                                                                                                                                                                              if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                if not exists (select 1 from public.mkc_people where user_id = uid) then raise exception 'Choose a username first'; end if;
                                                                                                                                                                                  select * into cur from public.mkc_cards where user_id = uid;
                                                                                                                                                                                    -- the app saves at most every few minutes; anything faster is a loop, so keep what is there
                                                                                                                                                                                      if cur.user_id is not null and cur.updated_at > now() - interval '3 seconds' then return public.mkc_card(uid); end if;
                                                                                                                                                                                        b := nullif(btrim(left(regexp_replace(coalesce(p_bio, ''), '[[:cntrl:]-‏‪-‮⁦-⁩]', ' ', 'g'), 160)), '');
                                                                                                                                                                                          insert into public.mkc_cards as c (user_id, bio, favs, trophies, show_trophies, share_activity, stats, recent, updated_at)
                                                                                                                                                                                            values (uid, b, public.mkc_titles(p_favs, 4), public.mkc_trophies(p_trophies), coalesce(p_show_trophies, true), coalesce(p_share, false),
                                                                                                                                                                                                case when p_share then public.mkc_stats(p_stats) end, case when p_share then public.mkc_titles(p_recent, 20) end, now())
                                                                                                                                                                                                  on conflict (user_id) do update set bio = excluded.bio, favs = excluded.favs, trophies = excluded.trophies,
                                                                                                                                                                                                      show_trophies = excluded.show_trophies, share_activity = excluded.share_activity, stats = excluded.stats, recent = excluded.recent, updated_at = now();
                                                                                                                                                                                                        return public.mkc_card(uid);
                                                                                                                                                                                                        end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_chat(other uuid, before_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                     select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from (
                                                                                                                                                                                                                                                                                                                                                                                                         select m.id, m.sender, m.kind, m.body, m.created_at, m.read_at from public.mkc_messages m
                                                                                                                                                                                                                                                                                                                                                                                                             where ((m.sender = auth.uid() and m.recipient = other) or (m.sender = other and m.recipient = auth.uid()))
                                                                                                                                                                                                                                                                                                                                                                                                                   and (before_id is null or m.id < before_id)
                                                                                                                                                                                                                                                                                                                                                                                                                       order by m.id desc limit 60) t;
                                                                                                                                                                                                                                                                                                                                                                                                                       $function$
;
CREATE OR REPLACE FUNCTION public.mkc_feed(p_before bigint DEFAULT NULL::bigint, p_user uuid DEFAULT NULL::uuid, p_mentions boolean DEFAULT false, p_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid(); out jsonb;
begin
  if uid is null then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(public.mkc_post_json(uid, t) order by t.id desc), '[]'::jsonb) into out from (
        select p.* from public.mkc_posts p
            where p.parent is null
                  and (p_id is null or p.id = p_id)
                        and (p_before is null or p.id < p_before)
                              and (p_user is null or p.author = p_user)
                                    and (not coalesce(p_mentions, false) or uid = any (p.tags))
                                          and (p.author = uid or public.mkc_staff_is(uid) or (not p.hidden and exists (
                                                  select 1 from public.mkc_friends a where a.user_id = uid and a.other_id = p.author and a.state = 'friend'
                                                            and exists (select 1 from public.mkc_friends b where b.user_id = p.author and b.other_id = uid and b.state = 'friend'))))
                                                                order by p.id desc limit case when p_id is null then 20 else 1 end) t;
                                                                  return out;
                                                                  end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_find(q text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                           declare uid uuid := auth.uid(); s text := lower(trim(coalesce(q, ''))); out jsonb;
                                                                                                                           begin
                                                                                                                             if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                               s := regexp_replace(s, '^@', '');
                                                                                                                                 if s !~ '^[a-z0-9_]{2,20}$' then return '[]'::jsonb; end if;
                                                                                                                                   select coalesce(jsonb_agg(r order by (r->>'username') <> s, r->>'username'), '[]'::jsonb) into out from (
                                                                                                                                       select jsonb_build_object('id', p.user_id, 'username', p.username, 'name', p.name, 'avatar', p.avatar,
                                                                                                                                             'rel', coalesce((select f.state from public.mkc_friends f where f.user_id = uid and f.other_id = p.user_id), '')) r
                                                                                                                                                 from public.mkc_people p
                                                                                                                                                     where p.user_id <> uid
                                                                                                                                                           and (p.username = s or (p.findable and length(s) >= 3 and p.username like s || '%'))
                                                                                                                                                                 and not exists (select 1 from public.mkc_friends b where b.user_id = p.user_id and b.other_id = uid and b.state = 'blocked')
                                                                                                                                                                       and not exists (select 1 from public.mkc_friends b where b.user_id = uid and b.other_id = p.user_id and b.state = 'blocked')
                                                                                                                                                                           order by p.username <> s, p.username limit 8) t;
                                                                                                                                                                             return out;
                                                                                                                                                                             end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_friend_add(other uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                             declare uid uuid := auth.uid(); mine text; theirs text;
                                                                                                                                                                             begin
                                                                                                                                                                               if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                 if other is null or other = uid then raise exception 'You can''t add yourself'; end if;
                                                                                                                                                                                   if not exists (select 1 from public.mkc_people where user_id = uid) then raise exception 'Choose a username first'; end if;
                                                                                                                                                                                     if not exists (select 1 from public.mkc_people where user_id = other) then raise exception 'No one has that username'; end if;
                                                                                                                                                                                       select state into mine from public.mkc_friends where user_id = uid and other_id = other;
                                                                                                                                                                                         select state into theirs from public.mkc_friends where user_id = other and other_id = uid;
                                                                                                                                                                                           if mine = 'friend' then return 'friend'; end if;
                                                                                                                                                                                             if mine = 'blocked' then raise exception 'Unblock them first'; end if;
                                                                                                                                                                                               if theirs = 'blocked' then return 'out'; end if; -- they are never told, and nothing reaches them
                                                                                                                                                                                                 if mine = 'in' then -- they already asked: accept
                                                                                                                                                                                                     update public.mkc_friends set state = 'friend' where user_id = uid and other_id = other;
                                                                                                                                                                                                         update public.mkc_friends set state = 'friend' where user_id = other and other_id = uid;
                                                                                                                                                                                                             return 'friend';
                                                                                                                                                                                                               end if;
                                                                                                                                                                                                                 if mine = 'out' then return 'out'; end if;
                                                                                                                                                                                                                   if (select count(*) from public.mkc_friends where user_id = uid and state = 'out') >= 30 then raise exception 'Too many requests waiting. Wait for some answers first.'; end if;
                                                                                                                                                                                                                     if (select count(*) from public.mkc_friends where user_id = uid and state = 'out' and created_at > now() - interval '1 hour') >= 20 then raise exception 'Too many requests in an hour. Try again later.'; end if;
                                                                                                                                                                                                                       insert into public.mkc_friends (user_id, other_id, state) values (uid, other, 'out');
                                                                                                                                                                                                                         insert into public.mkc_friends (user_id, other_id, state) values (other, uid, 'in') on conflict (user_id, other_id) do nothing;
                                                                                                                                                                                                                           return 'out';
                                                                                                                                                                                                                           end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_friend_answer(other uuid, accept boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                           declare uid uuid := auth.uid();
                                                                                                                                                                                                                           begin
                                                                                                                                                                                                                             if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                               if not exists (select 1 from public.mkc_friends where user_id = uid and other_id = other and state = 'in') then return 'gone'; end if;
                                                                                                                                                                                                                                 if accept then
                                                                                                                                                                                                                                     if not exists (select 1 from public.mkc_people where user_id = uid) then raise exception 'Choose a username first'; end if;
                                                                                                                                                                                                                                         update public.mkc_friends set state = 'friend' where user_id = uid and other_id = other;
                                                                                                                                                                                                                                             update public.mkc_friends set state = 'friend' where user_id = other and other_id = uid and state = 'out';
                                                                                                                                                                                                                                                 return 'friend';
                                                                                                                                                                                                                                                   end if;
                                                                                                                                                                                                                                                     delete from public.mkc_friends where user_id = uid and other_id = other;
                                                                                                                                                                                                                                                       delete from public.mkc_friends where user_id = other and other_id = uid and state = 'out';
                                                                                                                                                                                                                                                         return 'declined';
                                                                                                                                                                                                                                                         end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_friend_remove(other uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                         declare uid uuid := auth.uid();
                                                                                                                                                                                                                                                         begin
                                                                                                                                                                                                                                                           if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                             delete from public.mkc_friends where user_id = uid and other_id = other and state <> 'blocked';
                                                                                                                                                                                                                                                               delete from public.mkc_friends where user_id = other and other_id = uid and state <> 'blocked';
                                                                                                                                                                                                                                                                 return 'removed';
                                                                                                                                                                                                                                                                 end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_friends_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                                   select coalesce(jsonb_agg(jsonb_build_object(
                                                                                                                                                                                                                                                                                                                         'id', f.other_id, 'state', f.state, 'username', p.username, 'name', p.name, 'avatar', p.avatar,
                                                                                                                                                                                                                                                                                                                               'on',       case when f.state = 'friend' and pr.online and pr.seen_at > now() - interval '150 seconds' then true else false end,
                                                                                                                                                                                                                                                                                                                                     'busy',     case when f.state = 'friend' and pr.online and pr.seen_at > now() - interval '150 seconds' then pr.busy else false end,
                                                                                                                                                                                                                                                                                                                                           'watching', case when f.state = 'friend' and pr.online and pr.seen_at > now() - interval '150 seconds' then pr.watching else null end,
                                                                                                                                                                                                                                                                                                                                                 'seen',     case when f.state = 'friend' and pr.online then pr.seen_at else null end,
                                                                                                                                                                                                                                                                                                                                                       'calls',    case when f.state = 'friend' then p.calls else 'off' end,
                                                                                                                                                                                                                                                                                                                                                             'unread',   (select count(*) from public.mkc_messages m where m.recipient = auth.uid() and m.sender = f.other_id and m.read_at is null),
                                                                                                                                                                                                                                                                                                                                                                   'last',     (select max(m.created_at) from public.mkc_messages m where (m.recipient = auth.uid() and m.sender = f.other_id) or (m.sender = auth.uid() and m.recipient = f.other_id))
                                                                                                                                                                                                                                                                                                                                                                       ) order by f.state, p.username), '[]'::jsonb)
                                                                                                                                                                                                                                                                                                                                                                         from public.mkc_friends f
                                                                                                                                                                                                                                                                                                                                                                           join public.mkc_people p on p.user_id = f.other_id
                                                                                                                                                                                                                                                                                                                                                                             left join public.mkc_presence pr on pr.user_id = f.other_id
                                                                                                                                                                                                                                                                                                                                                                               where f.user_id = auth.uid();
                                                                                                                                                                                                                                                                                                                                                                               $function$
;
CREATE OR REPLACE FUNCTION public.mkc_here(p_online boolean, p_busy boolean, p_watching jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                                                                                               declare uid uuid := auth.uid();
                                                                                                                                                                                                                                                                                                                                                                               begin
                                                                                                                                                                                                                                                                                                                                                                                 if uid is null then return; end if;
                                                                                                                                                                                                                                                                                                                                                                                   insert into public.mkc_presence as x (user_id, online, busy, watching) values (uid, coalesce(p_online, false), coalesce(p_busy, false), p_watching)
                                                                                                                                                                                                                                                                                                                                                                                     on conflict (user_id) do update set online = excluded.online, busy = excluded.busy, watching = excluded.watching;
                                                                                                                                                                                                                                                                                                                                                                                     end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_hub_notes_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                              declare uid uuid := auth.uid();
                                                                                              begin
                                                                                                if uid is null then return null; end if;
                                                                                                  delete from public.mkc_hub_notes where user_id = uid and created_at < now() - interval '60 days';
                                                                                                    return jsonb_build_object(
                                                                                                        'unseen', (select count(*) from public.mkc_hub_notes n where n.user_id = uid and not n.seen and not public.mkc_blocked(uid, n.from_id)),
                                                                                                            'items', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
                                                                                                                  select jsonb_build_object('id', n.id, 'kind', n.kind, 'post', coalesce(p.parent, p.id), 'seen', n.seen, 'at', n.created_at,
                                                                                                                          'from', public.mkc_person(n.from_id), 'text', left(p.body, 120)) x
                                                                                                                                from public.mkc_hub_notes n join public.mkc_posts p on p.id = n.post_id
                                                                                                                                      where n.user_id = uid and not public.mkc_blocked(uid, n.from_id)
                                                                                                                                            order by n.id desc limit 40) t), '[]'::jsonb));
                                                                                                                                            end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_hub_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                              update public.mkc_hub_notes set seen = true where user_id = auth.uid() and not seen;
                                                                                                                                              $function$
;
CREATE OR REPLACE FUNCTION public.mkc_kudos_give(other uuid, p_kind text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                          declare uid uuid := auth.uid();
                                                                                                                                                                                                                                                                                                          begin
                                                                                                                                                                                                                                                                                                            if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                                                              if p_kind not in ('taste', 'host', 'gem', 'binge', 'pal') then raise exception 'Unknown kudos'; end if;
                                                                                                                                                                                                                                                                                                                if not public.mkc_are_friends(uid, other) then raise exception 'Only friends can give kudos'; end if;
                                                                                                                                                                                                                                                                                                                  if p_on then
                                                                                                                                                                                                                                                                                                                      if (select count(*) from public.mkc_kudos where giver = uid and created_at > now() - interval '1 day') >= 40 then raise exception 'That is plenty of kudos for today'; end if;
                                                                                                                                                                                                                                                                                                                          insert into public.mkc_kudos (giver, taker, kind) values (uid, other, p_kind) on conflict do nothing;
                                                                                                                                                                                                                                                                                                                            else
                                                                                                                                                                                                                                                                                                                                delete from public.mkc_kudos where giver = uid and taker = other and kind = p_kind;
                                                                                                                                                                                                                                                                                                                                  end if;
                                                                                                                                                                                                                                                                                                                                    return public.mkc_card(other);
                                                                                                                                                                                                                                                                                                                                    end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_me()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                             select coalesce((select jsonb_build_object('id', p.user_id, 'username', p.username, 'name', p.name, 'avatar', p.avatar,
                                                                                 'findable', p.findable, 'calls', p.calls) from public.mkc_people p where p.user_id = auth.uid()), 'null'::jsonb);
                                                                                 $function$
;
CREATE OR REPLACE FUNCTION public.mkc_note_forget(p_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                           declare uid uuid := auth.uid(); k integer;
                                                                                                                                                                                                                           begin
                                                                                                                                                                                                                             if uid is null then raise exception using errcode = '42501', message = 'Sign in first.'; end if;
                                                                                                                                                                                                                               delete from public.mkc_notes where id = p_id and (user_id = uid or public.mkcinema_is_owner());
                                                                                                                                                                                                                                 get diagnostics k = row_count;
                                                                                                                                                                                                                                   return k > 0;
                                                                                                                                                                                                                                   end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_note_send(p_kind text, p_body text, p_name text DEFAULT NULL::text, p_version text DEFAULT NULL::text, p_platform text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                      declare
                        hdr    jsonb := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
                          uid    uuid  := auth.uid();
                            ip     text;
                              t      timestamptz := pg_catalog.now();
                                e      double precision := extract(epoch from pg_catalog.now());
                                  b      text := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_body, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
                                    nm     text := nullif(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), '');
                                      old_id bigint;
                                        got    integer;
                                          hour_n integer;
                                            lim    record;
                                              new_id bigint;
                                              begin
                                                if p_kind is null or p_kind not in ('idea', 'thanks') then raise exception using errcode = '22023', message = 'Pick Idea or Thanks.'; end if;
                                                  if pg_catalog.char_length(b) < 3 then raise exception using errcode = '22023', message = 'Write a few words first.'; end if;
                                                    if pg_catalog.char_length(b) > 2000 then raise exception using errcode = '22023', message = 'Keep it under 2000 characters.'; end if;
                                                      nm := pg_catalog.left(nm, 40);

                                                        if pg_catalog.pg_total_relation_size('public.mkc_notes'::regclass) > 25 * 1024 * 1024 then
                                                            raise exception using errcode = 'PT429', message = 'The note box is full right now. Try again later.';
                                                              end if;

                                                                ip := coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(hdr ->> 'x-real-ip', ''),
                                                                                 nullif(pg_catalog.btrim(pg_catalog.split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
                                                                                   ip := pg_catalog.md5('mkc-note:' || ip);

                                                                                     -- the same words twice in a day (double tap, retry after a slow network) keep the first note
                                                                                       select n.id into old_id from public.mkc_notes n
                                                                                          where n.body = b and n.created_at > t - interval '1 day'
                                                                                               and (n.user_id = uid or (uid is null and n.user_id is null and n.created_at > t - interval '2 minutes'))
                                                                                                  order by n.id desc limit 1;
                                                                                                    if old_id is not null then return old_id; end if;

                                                                                                      for lim in
                                                                                                          select * from (values
                                                                                                                -- signed out: per network; signed in: per account, plus a looser per-network day cap (shared homes)
                                                                                                                      (case when uid is null then 'nt-ip10m:' || ip || ':' || pg_catalog.floor(e / 600)::bigint end,       3,   600),
                                                                                                                            ('nt-ipday:'  || ip  || ':' || pg_catalog.floor(e / 86400)::bigint,    case when uid is null then 10 else 40 end, 86400),
                                                                                                                                  ('nt-usr1h:'  || pg_catalog.md5('mkc-note-u:' || uid::text) || ':' || pg_catalog.floor(e / 3600)::bigint,  6, 3600),
                                                                                                                                        ('nt-usrday:' || pg_catalog.md5('mkc-note-u:' || uid::text) || ':' || pg_catalog.floor(e / 86400)::bigint, 15, 86400),
                                                                                                                                              ('nt-all1h:'  ||               pg_catalog.floor(e / 3600)::bigint,    120,  3600),
                                                                                                                                                    ('nt-allday:' ||               pg_catalog.floor(e / 86400)::bigint,   600, 86400)
                                                                                                                                                        ) as v(bucket, max_n, secs)
                                                                                                                                                            where v.bucket is not null   -- the usr rows vanish (null) when nobody is signed in
                                                                                                                                                              loop
                                                                                                                                                                  insert into public.mkcinema_log_rate as r (bucket, n, expires_at)
                                                                                                                                                                      values (lim.bucket, 1, t + pg_catalog.make_interval(secs => lim.secs))
                                                                                                                                                                          on conflict (bucket) do update set n = r.n + 1
                                                                                                                                                                              returning r.n into got;
                                                                                                                                                                                  if got > lim.max_n then
                                                                                                                                                                                        raise exception using errcode = 'PT429', message = 'Lots of notes were sent just now. Try again a bit later.';
                                                                                                                                                                                            end if;
                                                                                                                                                                                                if lim.bucket like 'nt-all1h:%' then hour_n := got; end if;
                                                                                                                                                                                                  end loop;
                                                                                                                                                                                                    if hour_n = 1 then delete from public.mkcinema_log_rate where expires_at < t; end if;

                                                                                                                                                                                                      insert into public.mkc_notes (user_id, kind, body, name, app_version, platform)
                                                                                                                                                                                                        values (uid, p_kind, b, nm, pg_catalog.left(p_version, 32), pg_catalog.left(p_platform, 32))
                                                                                                                                                                                                          returning id into new_id;
                                                                                                                                                                                                            return new_id;
                                                                                                                                                                                                            end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_note_set(p_id bigint, p_status text DEFAULT NULL::text, p_reply text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                          declare k integer; r text := nullif(pg_catalog.btrim(coalesce(p_reply, '')), '');
                                                                                                                                                                                                                                                                                                          begin
                                                                                                                                                                                                                                                                                                            if not public.mkcinema_is_owner() then raise exception using errcode = '42501', message = 'Only the owner can change notes.'; end if;
                                                                                                                                                                                                                                                                                                              if p_status is not null and p_status not in ('new', 'read', 'planned', 'done', 'declined') then
                                                                                                                                                                                                                                                                                                                  raise exception using errcode = '22023', message = 'Unknown status.';
                                                                                                                                                                                                                                                                                                                    end if;
                                                                                                                                                                                                                                                                                                                      update public.mkc_notes set
                                                                                                                                                                                                                                                                                                                          status     = coalesce(p_status, status),
                                                                                                                                                                                                                                                                                                                              reply      = case when p_reply is null then reply else pg_catalog.left(r, 600) end,
                                                                                                                                                                                                                                                                                                                                  replied_at = case when p_reply is null then replied_at when r is null then null else pg_catalog.now() end
                                                                                                                                                                                                                                                                                                                                     where id = p_id;
                                                                                                                                                                                                                                                                                                                                       get diagnostics k = row_count;
                                                                                                                                                                                                                                                                                                                                         return k > 0;
                                                                                                                                                                                                                                                                                                                                         end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_notes_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                      begin
                                                                                                                                                                                                                                                                                        if not public.mkcinema_is_owner() then raise exception using errcode = '42501', message = 'Only the owner can read notes.'; end if;
                                                                                                                                                                                                                                                                                          return (select pg_catalog.jsonb_build_object(
                                                                                                                                                                                                                                                                                              'new',    count(*) filter (where status = 'new'),
                                                                                                                                                                                                                                                                                                  'ideas',  count(*) filter (where kind = 'idea'),
                                                                                                                                                                                                                                                                                                      'thanks', count(*) filter (where kind = 'thanks'),
                                                                                                                                                                                                                                                                                                          'all',    count(*)) from public.mkc_notes);
                                                                                                                                                                                                                                                                                                          end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_notes_inbox(p_status text DEFAULT NULL::text, p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, kind text, body text, name text, signed_in boolean, app_version text, platform text, status text, reply text, replied_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                  begin
                                                                                                                                                                                                                                                    if not public.mkcinema_is_owner() then raise exception using errcode = '42501', message = 'Only the owner can read notes.'; end if;
                                                                                                                                                                                                                                                      return query
                                                                                                                                                                                                                                                          select n.id, n.kind, n.body, n.name, n.user_id is not null, n.app_version, n.platform, n.status, n.reply, n.replied_at, n.created_at
                                                                                                                                                                                                                                                                from public.mkc_notes n
                                                                                                                                                                                                                                                                     where (p_status is null or n.status = p_status or (p_status = 'open' and n.status in ('new', 'read', 'planned')))
                                                                                                                                                                                                                                                                            and (p_before is null or n.id < p_before)
                                                                                                                                                                                                                                                                                 order by n.id desc
                                                                                                                                                                                                                                                                                      limit least(greatest(coalesce(p_limit, 50), 1), 200);
                                                                                                                                                                                                                                                                                      end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_notes_mine()
 RETURNS TABLE(id bigint, kind text, body text, status text, reply text, replied_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                              select n.id, n.kind, n.body, n.status, n.reply, n.replied_at, n.created_at
                                                                                                                                                                                                                  from public.mkc_notes n
                                                                                                                                                                                                                     where auth.uid() is not null and n.user_id = auth.uid()
                                                                                                                                                                                                                        order by n.created_at desc
                                                                                                                                                                                                                           limit 50
                                                                                                                                                                                                                           $function$
;
CREATE OR REPLACE FUNCTION public.mkc_num(j jsonb, hi numeric DEFAULT '1000000000000'::numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                select case when jsonb_typeof(j) = 'number' then least(greatest((j #>> '{}')::numeric, 0), hi) end;
                                $function$
;
CREATE OR REPLACE FUNCTION public.mkc_period(j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                                                                  select case when jsonb_typeof(j) = 'object' then jsonb_strip_nulls(jsonb_build_object(
                                                                                      's', public.mkc_num(j->'s', 1e9), 'f', public.mkc_num(j->'f', 1e6), 'e', public.mkc_num(j->'e', 1e7), 'sh', public.mkc_num(j->'sh', 1e6))) end;
                                                                                      $function$
;
CREATE OR REPLACE FUNCTION public.mkc_person(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                      select jsonb_build_object('id', p.user_id, 'username', p.username, 'name', p.name, 'avatar', p.avatar) from public.mkc_people p where p.user_id = uid;
                                                                      $function$
;
CREATE OR REPLACE FUNCTION public.mkc_post(p_body text, p_mood text, p_title jsonb, p_parent bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                 declare uid uuid := auth.uid(); b text; root public.mkc_posts; tagged uuid[]; p public.mkc_posts; t uuid;
                                                                                                                 begin
                                                                                                                   if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                     if not exists (select 1 from public.mkc_people where user_id = uid) then raise exception 'Choose a username first'; end if;
                                                                                                                       b := btrim(regexp_replace(coalesce(p_body, ''), '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]', '', 'g'));
                                                                                                                         b := regexp_replace(b, '\n{3,}', E'\n\n', 'g');
                                                                                                                           if char_length(b) < 1 then raise exception 'Write something first'; end if;
                                                                                                                             if char_length(b) > 500 then raise exception 'Posts are 500 characters at most'; end if;
                                                                                                                               if p_mood is not null and p_mood not in ('hyped','chill','cozy','laughing','crying','scared','mindblown','bored','sleepy','hungry','romantic','angry') then p_mood := null; end if;
                                                                                                                                 if (select count(*) from public.mkc_posts where author = uid and created_at > now() - interval '10 minutes') >= 15 then raise exception 'Slow down a little. Try again in a few minutes.'; end if;
                                                                                                                                   if (select count(*) from public.mkc_posts where author = uid and created_at > now() - interval '1 day') >= 100 then raise exception 'That''s the limit for today. Back tomorrow!'; end if;
                                                                                                                                     if exists (select 1 from public.mkc_posts where author = uid and body = b and created_at > now() - interval '10 minutes') then raise exception 'You just posted that'; end if;
                                                                                                                                       if p_parent is not null then
                                                                                                                                           select * into root from public.mkc_posts where id = p_parent;
                                                                                                                                               if root.id is null then raise exception 'That post is gone'; end if;
                                                                                                                                                   if root.parent is not null then select * into root from public.mkc_posts where id = root.parent; end if; -- one level of replies
                                                                                                                                                       if not public.mkc_post_visible(uid, root) or root.hidden then raise exception 'That post is gone'; end if;
                                                                                                                                                           if public.mkc_blocked(uid, root.author) then raise exception 'That post is gone'; end if;
                                                                                                                                                             end if;
                                                                                                                                                               -- @tags: only accepted friends, at most 10
                                                                                                                                                                 select coalesce(array_agg(distinct pp.user_id), '{}') into tagged from (
                                                                                                                                                                     select pp.user_id from public.mkc_people pp
                                                                                                                                                                         where pp.username in (select lower(m[1]) from regexp_matches(b, '@([A-Za-z0-9_]{3,20})', 'g') m)
                                                                                                                                                                               and pp.user_id <> uid and public.mkc_are_friends(uid, pp.user_id)
                                                                                                                                                                                     -- in a reply, only people who can see the thread
                                                                                                                                                                                           and (root.id is null or (public.mkc_post_visible(pp.user_id, root) and not public.mkc_blocked(pp.user_id, root.author)))
                                                                                                                                                                                               limit 10) pp;
                                                                                                                                                                                                 insert into public.mkc_posts (author, parent, body, mood, title, tags)
                                                                                                                                                                                                     values (uid, root.id, b, case when p_parent is null then p_mood end,
                                                                                                                                                                                                           case when p_parent is null and p_title is not null then public.mkc_title(p_title) end, tagged)
                                                                                                                                                                                                               returning * into p;
                                                                                                                                                                                                                 foreach t in array tagged loop
                                                                                                                                                                                                                     insert into public.mkc_hub_notes (user_id, from_id, kind, post_id) values (t, uid, 'tag', p.id) on conflict do nothing;
                                                                                                                                                                                                                       end loop;
                                                                                                                                                                                                                         if root.id is not null and root.author <> uid and not (root.author = any (tagged)) then
                                                                                                                                                                                                                             insert into public.mkc_hub_notes (user_id, from_id, kind, post_id) values (root.author, uid, 'reply', p.id) on conflict do nothing;
                                                                                                                                                                                                                               end if;
                                                                                                                                                                                                                                 delete from public.mkc_posts where author = uid and parent is null and created_at < now() - interval '1 year';
                                                                                                                                                                                                                                   return public.mkc_post_json(uid, p);
                                                                                                                                                                                                                                   end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_post_delete(p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                   declare uid uuid := auth.uid(); p public.mkc_posts; root_author uuid;
                                                                                                                                                                                                                                   begin
                                                                                                                                                                                                                                     if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                       select * into p from public.mkc_posts where id = p_id;
                                                                                                                                                                                                                                         if p.id is null then return 'gone'; end if;
                                                                                                                                                                                                                                           if p.parent is not null then select author into root_author from public.mkc_posts where id = p.parent; end if;
                                                                                                                                                                                                                                             if p.author <> uid and coalesce(root_author, '00000000-0000-0000-0000-000000000000'::uuid) <> uid and not public.mkc_staff_is(uid) then
                                                                                                                                                                                                                                                 raise exception 'You can only delete your own posts'; end if;
                                                                                                                                                                                                                                                   delete from public.mkc_posts where id = p_id;
                                                                                                                                                                                                                                                     return 'deleted';
                                                                                                                                                                                                                                                     end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_post_json(viewer uuid, p mkc_posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                        select jsonb_build_object(
                                                                            'id', p.id, 'parent', p.parent, 'by', public.mkc_person(p.author), 'body', p.body, 'mood', p.mood, 'title', p.title,
                                                                                'at', p.created_at, 'hidden', p.hidden, 'mine', p.author = viewer,
                                                                                    'tags', coalesce((select jsonb_agg(public.mkc_person(t)) from unnest(p.tags) t), '[]'::jsonb),
                                                                                        'reacts', coalesce((select jsonb_object_agg(emoji, n) from (select r.emoji, count(*) n from public.mkc_reacts r where r.post_id = p.id group by r.emoji) x), '{}'::jsonb),
                                                                                            'me', coalesce((select jsonb_agg(r.emoji) from public.mkc_reacts r where r.post_id = p.id and r.user_id = viewer), '[]'::jsonb),
                                                                                                'replies', case when p.parent is null then (select count(*) from public.mkc_posts c where c.parent = p.id and not c.hidden
                                                                                                                 and not public.mkc_blocked(viewer, c.author)) end);
                                                                                                                 $function$
;
CREATE OR REPLACE FUNCTION public.mkc_post_report(p_id bigint, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                     declare uid uuid := auth.uid(); p public.mkc_posts; root public.mkc_posts; n int;
                                                                                                                                                                                                                                                     begin
                                                                                                                                                                                                                                                       if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                         select * into p from public.mkc_posts where id = p_id;
                                                                                                                                                                                                                                                           if p.id is null then return 'gone'; end if;
                                                                                                                                                                                                                                                             root := p; if p.parent is not null then select * into root from public.mkc_posts where id = p.parent; end if;
                                                                                                                                                                                                                                                               if p.author = uid or not public.mkc_post_visible(uid, root) then return 'gone'; end if;
                                                                                                                                                                                                                                                                 if (select count(*) from public.mkc_post_reports where reporter = uid and created_at > now() - interval '1 day') >= 20 then raise exception 'Too many reports today'; end if;
                                                                                                                                                                                                                                                                   insert into public.mkc_post_reports (post_id, reporter, author, body, reason) values (p.id, uid, p.author, p.body, left(coalesce(p_reason, ''), 500)) on conflict do nothing;
                                                                                                                                                                                                                                                                     select count(*) into n from public.mkc_post_reports where post_id = p.id;
                                                                                                                                                                                                                                                                       update public.mkc_posts set reports = n, hidden = hidden or n >= 3 where id = p.id;
                                                                                                                                                                                                                                                                         return 'reported';
                                                                                                                                                                                                                                                                         end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_post_visible(viewer uuid, p mkc_posts)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                select p.author = viewer or public.mkc_staff_is(viewer)
                                                                    or (not p.hidden and public.mkc_are_friends(viewer, p.author));
                                                                    $function$
;
CREATE OR REPLACE FUNCTION public.mkc_presence_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
                                                                  begin new.seen_at := now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_public_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                    select json_build_object(
                        'visits', s.visits,
                            'visits_per_hour', s.visits_per_hour,
                                'site_downloads', s.site_downloads,
                                    'site_downloads_per_hour', s.site_downloads_per_hour,
                                        'gh_downloads', s.gh_downloads,
                                            'gh_stars', s.gh_stars,
                                                'countries', s.countries,
                                                    'snapshot_at', s.snapshot_at,
                                                        'accounts', (select count(*) from public.mkcinema_profiles p join auth.users u on u.id = p.user_id)
                                                          )
                                                            from public.mkc_public_stats s where s.id = 1
                                                            $function$
;
CREATE OR REPLACE FUNCTION public.mkc_react(p_id bigint, p_emoji text, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                         declare uid uuid := auth.uid(); p public.mkc_posts; root public.mkc_posts;
                                                                                                                                                                                                                                                                         begin
                                                                                                                                                                                                                                                                           if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                             if p_emoji not in ('fire','lol','cry','wow','love','up') then raise exception 'Unknown reaction'; end if;
                                                                                                                                                                                                                                                                               select * into p from public.mkc_posts where id = p_id;
                                                                                                                                                                                                                                                                                 if p.id is null then raise exception 'That post is gone'; end if;
                                                                                                                                                                                                                                                                                   root := p; if p.parent is not null then select * into root from public.mkc_posts where id = p.parent; end if;
                                                                                                                                                                                                                                                                                     if not public.mkc_post_visible(uid, root) or p.hidden or public.mkc_blocked(uid, p.author) then raise exception 'That post is gone'; end if;
                                                                                                                                                                                                                                                                                       if p_on then
                                                                                                                                                                                                                                                                                           if (select count(*) from public.mkc_reacts where user_id = uid and created_at > now() - interval '1 hour') >= 150 then raise exception 'Slow down a little'; end if;
                                                                                                                                                                                                                                                                                               insert into public.mkc_reacts (post_id, user_id, emoji) values (p.id, uid, p_emoji) on conflict do nothing;
                                                                                                                                                                                                                                                                                                   if p.author <> uid then insert into public.mkc_hub_notes (user_id, from_id, kind, post_id) values (p.author, uid, 'react', p.id) on conflict do nothing; end if;
                                                                                                                                                                                                                                                                                                     else
                                                                                                                                                                                                                                                                                                         delete from public.mkc_reacts where post_id = p.id and user_id = uid and emoji = p_emoji;
                                                                                                                                                                                                                                                                                                           end if;
                                                                                                                                                                                                                                                                                                             return public.mkc_post_json(uid, p);
                                                                                                                                                                                                                                                                                                             end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_read(other uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                                         update public.mkc_messages set read_at = now() where recipient = auth.uid() and sender = other and read_at is null;
                                                                                                                                                                                                                                                                                                                                                                                                                         $function$
;
CREATE OR REPLACE FUNCTION public.mkc_replies(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                  declare uid uuid := auth.uid(); root public.mkc_posts;
                                                                  begin
                                                                    if uid is null then return '[]'::jsonb; end if;
                                                                      select * into root from public.mkc_posts where id = p_id and parent is null;
                                                                        if root.id is null or not public.mkc_post_visible(uid, root) then return '[]'::jsonb; end if;
                                                                          return coalesce((select jsonb_agg(public.mkc_post_json(uid, c) order by c.id) from (
                                                                              select * from public.mkc_posts c where c.parent = root.id
                                                                                    and (c.author = uid or root.author = uid or public.mkc_staff_is(uid) or not c.hidden)
                                                                                          and not public.mkc_blocked(uid, c.author)
                                                                                              order by c.id limit 200) c), '[]'::jsonb);
                                                                                              end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_report(other uuid, reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                               declare uid uuid := auth.uid();
                                                                                                                                                                                                                                                                                               begin
                                                                                                                                                                                                                                                                                                 if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                                                   if (select count(*) from public.mkc_reports where reporter = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'Too many reports today'; end if;
                                                                                                                                                                                                                                                                                                     insert into public.mkc_reports (reporter, reported, reason, recent)
                                                                                                                                                                                                                                                                                                         select uid, other, left(coalesce(reason, ''), 500), coalesce(jsonb_agg(jsonb_build_object('from', case when m.sender = uid then 'reporter' else 'reported' end, 'at', m.created_at, 'kind', m.kind, 'body', m.body) order by m.created_at), '[]'::jsonb)
                                                                                                                                                                                                                                                                                                             from (select * from public.mkc_messages where (sender = uid and recipient = other) or (sender = other and recipient = uid) order by created_at desc limit 30) m;
                                                                                                                                                                                                                                                                                                               perform public.mkc_block(other, true);
                                                                                                                                                                                                                                                                                                                 return 'reported';
                                                                                                                                                                                                                                                                                                                 end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_send(other uuid, p_kind text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                     declare uid uuid := auth.uid(); m public.mkc_messages;
                                                                                                                                                                                                                                                                                                                                                                                     begin
                                                                                                                                                                                                                                                                                                                                                                                       if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                                                                                                                                         if not public.mkc_are_friends(uid, other) then raise exception 'You can only message friends'; end if;
                                                                                                                                                                                                                                                                                                                                                                                           if coalesce(p_kind, 'text') not in ('text', 'party', 'call', 'title') then raise exception 'Unknown message'; end if;
                                                                                                                                                                                                                                                                                                                                                                                             if (select count(*) from public.mkc_messages where sender = uid and created_at > now() - interval '1 minute') >= 30 then raise exception 'Slow down a little'; end if;
                                                                                                                                                                                                                                                                                                                                                                                               insert into public.mkc_messages (sender, recipient, kind, body) values (uid, other, coalesce(p_kind, 'text'), left(trim(p_body), 1000)) returning * into m;
                                                                                                                                                                                                                                                                                                                                                                                                 delete from public.mkc_messages where ((sender = uid and recipient = other) or (sender = other and recipient = uid)) and created_at < now() - interval '180 days';
                                                                                                                                                                                                                                                                                                                                                                                                   return to_jsonb(m);
                                                                                                                                                                                                                                                                                                                                                                                                   end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_set_me(p_username text, p_name text, p_avatar text, p_findable boolean, p_calls text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid(); u text := lower(trim(coalesce(p_username, ''))); cur public.mkc_people;
  st boolean := exists (select 1 from public.mkc_staff where user_id = auth.uid());
  av text := nullif(trim(coalesce(p_avatar, '')), '');
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if u !~ '^[a-z0-9_]{3,20}$' then raise exception 'Usernames are 3 to 20 letters, numbers or _'; end if;
  p_name := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]​-‏‪-‮⁦-⁩]', '', 'g'));
  if not st then
    if p_name ~* '(mkcinema|mk cinema|admin|moderator|official|support team|dee ?lavish)' then raise exception 'Please choose another display name'; end if;
    if u ~ '^(admin|administrator|mod|moderator|support|help|staff|official|mkcinema|mk_cinema|mkc|system|root|owner|dee_?lavish|null|undefined|everyone)' then
      raise exception 'That username is reserved'; end if;
  end if;
  if av is not null and av not in ('gold','ember','rose','violet','sky','teal','lime','silver','diamond') then av := null; end if;
  if av = 'diamond' and not st then av := null; end if;
  select * into cur from public.mkc_people where user_id = uid;
  if exists (select 1 from public.mkc_people where username = u and user_id <> uid) then raise exception 'That username is taken'; end if;
  if cur.user_id is not null and cur.username <> u and cur.renamed_at > now() - interval '1 day' then
    raise exception 'You can change your username once a day'; end if;
  insert into public.mkc_people as p (user_id, username, name, avatar, findable, calls)
    values (uid, u, nullif(left(trim(coalesce(p_name, '')), 32), ''), av, coalesce(p_findable, false), coalesce(p_calls, 'off'))
    on conflict (user_id) do update set
      username = excluded.username, name = excluded.name, avatar = excluded.avatar, findable = excluded.findable, calls = excluded.calls,
      renamed_at = case when p.username <> excluded.username then now() else p.renamed_at end;
  return public.mkc_me();
end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_social()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                select coalesce(jsonb_agg(jsonb_build_object(
                                                                                                                                                      'id', f.other_id, 'username', p.username, 'name', p.name, 'avatar', p.avatar,
                                                                                                                                                            'stats', case when c.share_activity then c.stats end,
                                                                                                                                                                  'recent', case when c.share_activity then (select jsonb_agg(e) from (select e from jsonb_array_elements(coalesce(c.recent, '[]'::jsonb)) e limit 8) t) end,
                                                                                                                                                                        'tc', case when coalesce(c.show_trophies, true) then (select count(*) from jsonb_object_keys(coalesce(c.trophies, '{}'::jsonb))) + (select count(*) from jsonb_object_keys(public.mkc_srv_trophies(f.other_id))) end,
                                                                                                                                                                              'mood', case when c.mood_until is null or c.mood_until > now() then c.mood end,
                                                                                                                                                                                    'mood_text', case when c.mood_until is null or c.mood_until > now() then c.mood_text end,
                                                                                                                                                                                          'mood_at', case when c.mood_until is null or c.mood_until > now() then c.mood_at end,
                                                                                                                                                                                                'updated', c.updated_at
                                                                                                                                                                                                    ) order by p.username), '[]'::jsonb)
                                                                                                                                                                                                      from public.mkc_friends f
                                                                                                                                                                                                        join public.mkc_people p on p.user_id = f.other_id
                                                                                                                                                                                                          left join public.mkc_cards c on c.user_id = f.other_id
                                                                                                                                                                                                            where f.user_id = auth.uid() and f.state = 'friend' and public.mkc_are_friends(auth.uid(), f.other_id);
                                                                                                                                                                                                            $function$
;
CREATE OR REPLACE FUNCTION public.mkc_srv_trophies(uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                              declare made timestamptz; yrs int; pals int; liked int; o jsonb := '{}'::jsonb;
                                                                                                                                              begin
                                                                                                                                                select created_at into made from auth.users where id = uid;
                                                                                                                                                  if made is null then return o; end if;
                                                                                                                                                    yrs := extract(year from age(now(), made))::int;
                                                                                                                                                      for y in 1 .. least(yrs, 10) loop o := o || jsonb_build_object('club' || y, extract(epoch from made + make_interval(years => y)) * 1000); end loop;
                                                                                                                                                        if made < timestamptz '2027-01-01 00:00:00+00' then o := o || jsonb_build_object('early', extract(epoch from made) * 1000); end if;
                                                                                                                                                          select count(*) into pals from public.mkc_friends a where a.user_id = uid and a.state = 'friend'
                                                                                                                                                              and exists (select 1 from public.mkc_friends b where b.user_id = a.other_id and b.other_id = uid and b.state = 'friend');
                                                                                                                                                                if pals >= 1 then o := o || '{"pals1": 0}'::jsonb; end if;
                                                                                                                                                                  if pals >= 10 then o := o || '{"pals10": 0}'::jsonb; end if;
                                                                                                                                                                    select count(*) into liked from public.mkc_kudos where taker = uid;
                                                                                                                                                                      if liked >= 10 then o := o || '{"liked10": 0}'::jsonb; end if;
                                                                                                                                                                        if liked >= 50 then o := o || '{"liked50": 0}'::jsonb; end if;
                                                                                                                                                                          return o;
                                                                                                                                                                          end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_staff_is(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                            select exists (select 1 from public.mkc_staff where user_id = uid);
                                                            $function$
;
CREATE OR REPLACE FUNCTION public.mkc_stats(j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                                                                        select case when jsonb_typeof(j) = 'object' then jsonb_strip_nulls(jsonb_build_object(
                                                                                            'm', public.mkc_period(j->'m'), 'y', public.mkc_period(j->'y'), 'a', public.mkc_period(j->'a'),
                                                                                                'cur', public.mkc_num(j->'cur', 1e5), 'best', public.mkc_num(j->'best', 1e5),
                                                                                                    'p', public.mkc_txt(j->'p', 24), 'mon', case when (j->>'mon') ~ '^\d{4}-\d{2}$' then j->>'mon' end,
                                                                                                        'g', (select jsonb_agg(public.mkc_txt(g, 24)) from (select g from jsonb_array_elements(case when jsonb_typeof(j->'g') = 'array' then j->'g' else '[]'::jsonb end) g limit 3) t
                                                                                                                  where public.mkc_txt(g, 24) is not null))) end;
                                                                                                                  $function$
;
CREATE OR REPLACE FUNCTION public.mkc_status_me()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                              select coalesce((select jsonb_build_object('mood', c.mood, 'text', c.mood_text, 'at', c.mood_at, 'until', c.mood_until)
                                                                                                                                                                                                                  from public.mkc_cards c where c.user_id = auth.uid() and (c.mood_until is null or c.mood_until > now()) and (c.mood is not null or c.mood_text is not null)), 'null'::jsonb);
                                                                                                                                                                                                                  $function$
;
CREATE OR REPLACE FUNCTION public.mkc_status_set(p_mood text, p_text text, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
                                                                                                                                                                                                                                                                                                             declare uid uuid := auth.uid(); t text;
                                                                                                                                                                                                                                                                                                             begin
                                                                                                                                                                                                                                                                                                               if uid is null then raise exception 'Sign in first'; end if;
                                                                                                                                                                                                                                                                                                                 if not exists (select 1 from public.mkc_people where user_id = uid) then raise exception 'Choose a username first'; end if;
                                                                                                                                                                                                                                                                                                                   if p_mood is not null and p_mood not in ('hyped','chill','cozy','laughing','crying','scared','mindblown','bored','sleepy','hungry','romantic','angry') then p_mood := null; end if;
                                                                                                                                                                                                                                                                                                                     t := nullif(btrim(left(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2066-\u2069]', ' ', 'g'), 80)), '');
                                                                                                                                                                                                                                                                                                                       insert into public.mkc_cards as c (user_id, mood, mood_text, mood_at, mood_until)
                                                                                                                                                                                                                                                                                                                           values (uid, p_mood, t, now(), case when p_hours between 1 and 168 then now() + make_interval(hours => p_hours) end)
                                                                                                                                                                                                                                                                                                                             on conflict (user_id) do update set mood = excluded.mood, mood_text = excluded.mood_text, mood_at = excluded.mood_at, mood_until = excluded.mood_until;
                                                                                                                                                                                                                                                                                                                               return jsonb_build_object('mood', p_mood, 'text', t, 'at', now(), 'until', case when p_hours between 1 and 168 then now() + make_interval(hours => p_hours) end);
                                                                                                                                                                                                                                                                                                                               end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_title(j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                      select case when jsonb_typeof(j) = 'object' and public.mkc_txt(j->'t', 120) is not null then jsonb_strip_nulls(jsonb_build_object(
                                          't',  public.mkc_txt(j->'t', 120),
                                              'id', case when (j->>'id') ~ '^(tt\d{1,10}|tmdb:\d{1,10}|kitsu:\d{1,10}|mal:\d{1,10})$' then j->>'id' end,
                                                  'k',  case when (j->>'k') in ('movie', 'series', 'anime') then j->>'k' end,
                                                      'p',  case when (j->>'p') ~ '^https://[^\s"''<>()\\]{8,}$' and char_length(j->>'p') <= 300 then j->>'p' end,
                                                          'ep', public.mkc_txt(j->'ep', 16),
                                                              'n',  public.mkc_num(j->'n', 9999),
                                                                  'at', public.mkc_num(j->'at', 1e14)))
                                                                    end;
                                                                    $function$
;
CREATE OR REPLACE FUNCTION public.mkc_titles(j jsonb, maxn integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                                                      select coalesce((select jsonb_agg(x order by i) from (
                                                                            select public.mkc_title(e) x, i from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) with ordinality a(e, i)
                                                                                ) t where x is not null and i <= maxn), '[]'::jsonb);
                                                                                $function$
;
CREATE OR REPLACE FUNCTION public.mkc_trophies(j jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                                                                                                    select coalesce((select jsonb_object_agg(key, public.mkc_num(value, 1e14)) from (
                                                                                                                          select key, value from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end)
                                                                                                                                where key ~ '^[a-z][a-z0-9]{1,11}$' and jsonb_typeof(value) = 'number'
                                                                                                                                        and key !~ '^(club\d+|early|pals\d+|liked\d+)$'
                                                                                                                                              order by key limit 60) t), '{}'::jsonb);
                                                                                                                                              $function$
;
CREATE OR REPLACE FUNCTION public.mkc_txt(j jsonb, n integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                  select nullif(btrim(left(regexp_replace(j #>> '{}', '[[:cntrl:]-‏‪-‮⁦-⁩<>]', '', 'g'), n)), '')
                                    where jsonb_typeof(j) = 'string';
                                    $function$
;
CREATE OR REPLACE FUNCTION public.mkc_usage_add(d text, dev text, lang text, cc text, rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_dev text; v_lang text; v_cc text;
    today date := (now() at time zone 'America/New_York')::date;
      dd date; r jsonb; done int := 0; hdr json; c text;
      begin
        begin dd := d::date; exception when others then dd := today; end;
          if dd > today or dd < today - 2 then dd := today; end if;
            if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 300 then return 0; end if;
              dev  := coalesce(substring(lower(dev)  from '^[a-z0-9-]{1,24}$'), '');
                lang := coalesce(substring(lower(lang) from '^[a-z]{2,3}(-[a-z]{2})?$'), '');
                  -- the country comes from the network header when there is one; otherwise the app's guess (2 letters) or ''
                    begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
                      c := upper(coalesce(hdr->>'cf-ipcountry', hdr->>'x-country', cc, ''));
                        cc := coalesce(substring(c from '^[A-Z]{2}$'), '');
                          if cc = 'XX' or cc = 'T1' then cc := ''; end if;
                            v_dev := dev; v_lang := lang; v_cc := cc;
                              for r in select * from jsonb_array_elements(rows) loop
                                  continue when jsonb_typeof(r) <> 'array' or jsonb_array_length(r) < 3;
                                      continue when (r->>0) is null or (r->>0) not in ('open','view','layer','tap','row','set','feat','party');
                                          continue when (r->>1) is null or (r->>1) !~ '^[A-Za-z0-9_.:=/+-]{1,64}$';
                                              begin
                                                  insert into mkc_usage_daily as u (day, ev, k, dev, lang, cc, n, secs)
                                                      values (dd, r->>0, r->>1, v_dev, v_lang, v_cc,
                                                                  least(greatest(coalesce((r->>2)::numeric, 0), 0), 500)::bigint,
                                                                              least(greatest(coalesce((r->>3)::numeric, 0), 0), 86400)::bigint)
                                                                                  on conflict (day, ev, k, dev, lang, cc)
                                                                                      do update set n = u.n + excluded.n, secs = u.secs + excluded.secs;
                                                                                          done := done + 1;
                                                                                              exception when others then null; -- a bad row is skipped, the rest still count
                                                                                                  end;
                                                                                                    end loop;
                                                                                                      return done;
                                                                                                      end $function$
;
CREATE OR REPLACE FUNCTION public.mkc_uuid(t text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
                                                                    select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end;
                                                                    $function$
;
CREATE OR REPLACE FUNCTION public.mkcinema_delete_me()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := auth.uid(); shared boolean := false;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.mkcinema_profiles where user_id = uid;
  -- this Supabase project also hosts another app: never remove a login that app still uses.
  -- (dynamic so the same function also installs on a project that has no public.profiles table)
  if pg_catalog.to_regclass('public.profiles') is not null then
    execute 'select exists(select 1 from public.profiles where id = $1 and couple_id is not null)' into shared using uid;
  end if;
  if shared then return 'data'; end if;
  begin
    delete from auth.users where id = uid;
  exception when others then
    return 'data';
  end;
  return 'account';
end $function$
;
CREATE OR REPLACE FUNCTION public.mkcinema_is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select auth.uid() = 'fd0f579d-ad6b-40bc-a246-1b0e47fad70a'::uuid $function$
;
CREATE OR REPLACE FUNCTION public.mkcinema_logs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
      hdr    jsonb;
        claims jsonb;
          ip     text;
            who    text;
              t      timestamptz := pg_catalog.now();
                e      double precision := extract(epoch from pg_catalog.now());
                  got    integer;
                    hour_n integer;
                      lim    record;
                      begin
                        new.created_at := t;

                          hdr    := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
                            claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
                              if hdr is null or coalesce(claims ->> 'role', '') = 'service_role' then return new; end if;

                                if pg_catalog.pg_total_relation_size('public.mkcinema_logs'::regclass) > 150 * 1024 * 1024 then
                                    raise exception using errcode = 'PT429', message = 'The log store is full right now. Try again tomorrow.';
                                      end if;

                                        ip := coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(hdr ->> 'x-real-ip', ''),
                                                         nullif(pg_catalog.btrim(pg_catalog.split_part(coalesce(hdr ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
                                                           ip := pg_catalog.md5('mkc-log:' || ip);
                                                             who := nullif(claims ->> 'sub', '');
                                                               if who is not null then who := pg_catalog.md5('mkc-log-u:' || who); end if;

                                                                 for lim in
                                                                     select * from (values
                                                                           ('ip10m:'  || ip  || ':' || pg_catalog.floor(e / 600)::bigint,     5,  600),
                                                                                 ('ipday:'  || ip  || ':' || pg_catalog.floor(e / 86400)::bigint,  20, 86400),
                                                                                       ('usr1h:'  || who || ':' || pg_catalog.floor(e / 3600)::bigint,   10, 3600),
                                                                                             ('usrday:' || who || ':' || pg_catalog.floor(e / 86400)::bigint,  30, 86400),
                                                                                                   ('all1h:'  ||               pg_catalog.floor(e / 3600)::bigint,  300, 3600),
                                                                                                         ('allday:' ||               pg_catalog.floor(e / 86400)::bigint, 1500, 86400)
                                                                                                             ) as v(bucket, max_n, secs)
                                                                                                                 where v.bucket is not null   -- the usr* rows vanish (null) when nobody is signed in
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

                                                                                                                                                         if hour_n = 1 then
                                                                                                                                                             delete from public.mkcinema_log_rate where expires_at < t;
                                                                                                                                                                 delete from public.mkcinema_logs where created_at < t - interval '30 days';
                                                                                                                                                                   end if;
                                                                                                                                                                     return new;
                                                                                                                                                                     end $function$
;
CREATE OR REPLACE FUNCTION public.mkcinema_profiles_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := clock_timestamp();
    return new;
    end $function$
;

-- ---------- indexes, row level security and policies ----------
create index if not exists mkc_kudos_taker ON public.mkc_kudos USING btree (taker);
create index if not exists mkc_kudos_giver_day ON public.mkc_kudos USING btree (giver, created_at DESC);
create unique index if not exists mkc_hub_notes_once ON public.mkc_hub_notes USING btree (user_id, from_id, kind, post_id);
create index if not exists mkc_messages_pair ON public.mkc_messages USING btree (recipient, sender, created_at DESC);
create index if not exists mkc_reacts_user ON public.mkc_reacts USING btree (user_id, created_at DESC);
create index if not exists mkc_friends_other ON public.mkc_friends USING btree (other_id);
create index if not exists mkc_notes_created ON public.mkc_notes USING btree (created_at DESC);
create index if not exists mkc_posts_author ON public.mkc_posts USING btree (author, id DESC);
create index if not exists mkcinema_logs_created_at ON public.mkcinema_logs USING btree (created_at DESC);
create index if not exists mkc_people_prefix ON public.mkc_people USING btree (username text_pattern_ops) WHERE findable;
create index if not exists mkc_posts_parent ON public.mkc_posts USING btree (parent, id) WHERE (parent IS NOT NULL);
create index if not exists mkc_posts_tags ON public.mkc_posts USING gin (tags);
create index if not exists mkc_notes_user ON public.mkc_notes USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);
create index if not exists mkc_messages_sent ON public.mkc_messages USING btree (sender, created_at DESC);
create index if not exists mkc_hub_notes_user ON public.mkc_hub_notes USING btree (user_id, id DESC);

alter table public.miko_ai_usage enable row level security;
alter table public.mkc_cards enable row level security;
alter table public.mkc_friends enable row level security;
alter table public.mkc_hub_notes enable row level security;
alter table public.mkc_kudos enable row level security;
alter table public.mkc_messages enable row level security;
alter table public.mkc_notes enable row level security;
alter table public.mkc_people enable row level security;
alter table public.mkc_post_reports enable row level security;
alter table public.mkc_posts enable row level security;
alter table public.mkc_presence enable row level security;
alter table public.mkc_public_stats enable row level security;
alter table public.mkc_reacts enable row level security;
alter table public.mkc_reports enable row level security;
alter table public.mkc_staff enable row level security;
alter table public.mkc_usage_daily enable row level security;
alter table public.mkcinema_log_rate enable row level security;
alter table public.mkcinema_logs enable row level security;
alter table public.mkcinema_notice enable row level security;
alter table public.mkcinema_profiles enable row level security;

drop policy if exists "mkc_cards: own row" on public.mkc_cards;
create policy "mkc_cards: own row" on public.mkc_cards as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_friends: own rows" on public.mkc_friends;
create policy "mkc_friends: own rows" on public.mkc_friends as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_hub_notes: own" on public.mkc_hub_notes;
create policy "mkc_hub_notes: own" on public.mkc_hub_notes as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_kudos: mine" on public.mkc_kudos;
create policy "mkc_kudos: mine" on public.mkc_kudos as permissive for select to authenticated
  using (((giver = ( SELECT auth.uid() AS uid)) OR (taker = ( SELECT auth.uid() AS uid))));
drop policy if exists "mkc_messages: my chats" on public.mkc_messages;
create policy "mkc_messages: my chats" on public.mkc_messages as permissive for select to authenticated
  using (((sender = ( SELECT auth.uid() AS uid)) OR (recipient = ( SELECT auth.uid() AS uid))));
drop policy if exists "mkc_notes no direct access" on public.mkc_notes;
create policy "mkc_notes no direct access" on public.mkc_notes as restrictive for all to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "mkc_people: own row" on public.mkc_people;
create policy "mkc_people: own row" on public.mkc_people as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_posts: own" on public.mkc_posts;
create policy "mkc_posts: own" on public.mkc_posts as permissive for select to authenticated
  using ((author = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_presence: own row" on public.mkc_presence;
create policy "mkc_presence: own row" on public.mkc_presence as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkc_reacts: own" on public.mkc_reacts;
create policy "mkc_reacts: own" on public.mkc_reacts as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "mkcinema_log_rate no access" on public.mkcinema_log_rate;
create policy "mkcinema_log_rate no access" on public.mkcinema_log_rate as restrictive for all to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "mkcinema_logs insert only" on public.mkcinema_logs;
create policy "mkcinema_logs insert only" on public.mkcinema_logs as permissive for insert to anon, authenticated
  with check (true);
drop policy if exists mkcinema_logs_owner_delete on public.mkcinema_logs;
create policy mkcinema_logs_owner_delete on public.mkcinema_logs as permissive for delete to authenticated
  using (mkcinema_is_owner());
drop policy if exists mkcinema_logs_owner_read on public.mkcinema_logs;
create policy mkcinema_logs_owner_read on public.mkcinema_logs as permissive for select to authenticated
  using (mkcinema_is_owner());
drop policy if exists "mkcinema_notice owner update" on public.mkcinema_notice;
create policy "mkcinema_notice owner update" on public.mkcinema_notice as permissive for update to authenticated
  using (( SELECT mkcinema_is_owner() AS mkcinema_is_owner))
  with check (( SELECT mkcinema_is_owner() AS mkcinema_is_owner));
drop policy if exists "mkcinema_notice read" on public.mkcinema_notice;
create policy "mkcinema_notice read" on public.mkcinema_notice as permissive for select to anon, authenticated
  using (true);
drop policy if exists "mkcinema: insert own" on public.mkcinema_profiles;
create policy "mkcinema: insert own" on public.mkcinema_profiles as permissive for insert to public
  with check ((auth.uid() = user_id));
drop policy if exists "mkcinema: read own" on public.mkcinema_profiles;
create policy "mkcinema: read own" on public.mkcinema_profiles as permissive for select to public
  using ((auth.uid() = user_id));
drop policy if exists "mkcinema: update own" on public.mkcinema_profiles;
create policy "mkcinema: update own" on public.mkcinema_profiles as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

-- ---------- triggers ----------
drop trigger if exists mkcinema_profiles_stamp on public.mkcinema_profiles;
CREATE TRIGGER mkcinema_profiles_stamp BEFORE INSERT OR UPDATE ON public.mkcinema_profiles FOR EACH ROW EXECUTE FUNCTION mkcinema_profiles_stamp();
drop trigger if exists mkcinema_logs_guard on public.mkcinema_logs;
CREATE TRIGGER mkcinema_logs_guard BEFORE INSERT ON public.mkcinema_logs FOR EACH ROW EXECUTE FUNCTION mkcinema_logs_guard();
drop trigger if exists mkc_presence_stamp on public.mkc_presence;
CREATE TRIGGER mkc_presence_stamp BEFORE INSERT OR UPDATE ON public.mkc_presence FOR EACH ROW EXECUTE FUNCTION mkc_presence_stamp();

-- ---------- who may call what ----------
revoke all on function public.miko_ai_hit(buckets text[]) from public, anon, authenticated; grant execute on function public.miko_ai_hit(buckets text[]) to service_role;
revoke all on function public.mkc_account_format(p_email text) from public, anon, authenticated; grant execute on function public.mkc_account_format(p_email text) to anon, authenticated, service_role;
revoke all on function public.mkc_am_staff() from public, anon, authenticated; grant execute on function public.mkc_am_staff() to authenticated, service_role;
revoke all on function public.mkc_are_friends(a uuid, b uuid) from public, anon, authenticated; grant execute on function public.mkc_are_friends(a uuid, b uuid) to authenticated, service_role;
revoke all on function public.mkc_block(other uuid, on_ boolean) from public, anon, authenticated; grant execute on function public.mkc_block(other uuid, on_ boolean) to authenticated, service_role;
revoke all on function public.mkc_blocked(a uuid, b uuid) from public, anon, authenticated; grant execute on function public.mkc_blocked(a uuid, b uuid) to service_role;
revoke all on function public.mkc_card(other uuid) from public, anon, authenticated; grant execute on function public.mkc_card(other uuid) to authenticated, service_role;
revoke all on function public.mkc_card_set(p_bio text, p_favs jsonb, p_trophies jsonb, p_show_trophies boolean, p_share boolean, p_stats jsonb, p_recent jsonb) from public, anon, authenticated; grant execute on function public.mkc_card_set(p_bio text, p_favs jsonb, p_trophies jsonb, p_show_trophies boolean, p_share boolean, p_stats jsonb, p_recent jsonb) to authenticated, service_role;
revoke all on function public.mkc_chat(other uuid, before_id bigint) from public, anon, authenticated; grant execute on function public.mkc_chat(other uuid, before_id bigint) to authenticated, service_role;
revoke all on function public.mkc_feed(p_before bigint, p_user uuid, p_mentions boolean, p_id bigint) from public, anon, authenticated; grant execute on function public.mkc_feed(p_before bigint, p_user uuid, p_mentions boolean, p_id bigint) to authenticated, service_role;
revoke all on function public.mkc_find(q text) from public, anon, authenticated; grant execute on function public.mkc_find(q text) to authenticated, service_role;
revoke all on function public.mkc_friend_add(other uuid) from public, anon, authenticated; grant execute on function public.mkc_friend_add(other uuid) to authenticated, service_role;
revoke all on function public.mkc_friend_answer(other uuid, accept boolean) from public, anon, authenticated; grant execute on function public.mkc_friend_answer(other uuid, accept boolean) to authenticated, service_role;
revoke all on function public.mkc_friend_remove(other uuid) from public, anon, authenticated; grant execute on function public.mkc_friend_remove(other uuid) to authenticated, service_role;
revoke all on function public.mkc_friends_list() from public, anon, authenticated; grant execute on function public.mkc_friends_list() to authenticated, service_role;
revoke all on function public.mkc_here(p_online boolean, p_busy boolean, p_watching jsonb) from public, anon, authenticated; grant execute on function public.mkc_here(p_online boolean, p_busy boolean, p_watching jsonb) to authenticated, service_role;
revoke all on function public.mkc_hub_notes_list() from public, anon, authenticated; grant execute on function public.mkc_hub_notes_list() to authenticated, service_role;
revoke all on function public.mkc_hub_seen() from public, anon, authenticated; grant execute on function public.mkc_hub_seen() to authenticated, service_role;
revoke all on function public.mkc_kudos_give(other uuid, p_kind text, p_on boolean) from public, anon, authenticated; grant execute on function public.mkc_kudos_give(other uuid, p_kind text, p_on boolean) to authenticated, service_role;
revoke all on function public.mkc_me() from public, anon, authenticated; grant execute on function public.mkc_me() to authenticated, service_role;
revoke all on function public.mkc_note_forget(p_id bigint) from public, anon, authenticated; grant execute on function public.mkc_note_forget(p_id bigint) to authenticated, service_role;
revoke all on function public.mkc_note_send(p_kind text, p_body text, p_name text, p_version text, p_platform text) from public, anon, authenticated; grant execute on function public.mkc_note_send(p_kind text, p_body text, p_name text, p_version text, p_platform text) to anon, authenticated, service_role;
revoke all on function public.mkc_note_set(p_id bigint, p_status text, p_reply text) from public, anon, authenticated; grant execute on function public.mkc_note_set(p_id bigint, p_status text, p_reply text) to authenticated, service_role;
revoke all on function public.mkc_notes_counts() from public, anon, authenticated; grant execute on function public.mkc_notes_counts() to authenticated, service_role;
revoke all on function public.mkc_notes_inbox(p_status text, p_before bigint, p_limit integer) from public, anon, authenticated; grant execute on function public.mkc_notes_inbox(p_status text, p_before bigint, p_limit integer) to authenticated, service_role;
revoke all on function public.mkc_notes_mine() from public, anon, authenticated; grant execute on function public.mkc_notes_mine() to authenticated, service_role;
revoke all on function public.mkc_num(j jsonb, hi numeric) from public, anon, authenticated; grant execute on function public.mkc_num(j jsonb, hi numeric) to anon, authenticated, service_role;
revoke all on function public.mkc_period(j jsonb) from public, anon, authenticated; grant execute on function public.mkc_period(j jsonb) to anon, authenticated, service_role;
revoke all on function public.mkc_person(uid uuid) from public, anon, authenticated; grant execute on function public.mkc_person(uid uuid) to service_role;
revoke all on function public.mkc_post(p_body text, p_mood text, p_title jsonb, p_parent bigint) from public, anon, authenticated; grant execute on function public.mkc_post(p_body text, p_mood text, p_title jsonb, p_parent bigint) to authenticated, service_role;
revoke all on function public.mkc_post_delete(p_id bigint) from public, anon, authenticated; grant execute on function public.mkc_post_delete(p_id bigint) to authenticated, service_role;
revoke all on function public.mkc_post_json(viewer uuid, p mkc_posts) from public, anon, authenticated; grant execute on function public.mkc_post_json(viewer uuid, p mkc_posts) to service_role;
revoke all on function public.mkc_post_report(p_id bigint, p_reason text) from public, anon, authenticated; grant execute on function public.mkc_post_report(p_id bigint, p_reason text) to authenticated, service_role;
revoke all on function public.mkc_post_visible(viewer uuid, p mkc_posts) from public, anon, authenticated; grant execute on function public.mkc_post_visible(viewer uuid, p mkc_posts) to service_role;
revoke all on function public.mkc_presence_stamp() from public, anon, authenticated; grant execute on function public.mkc_presence_stamp() to anon, authenticated, service_role;
revoke all on function public.mkc_public_stats() from public, anon, authenticated; grant execute on function public.mkc_public_stats() to anon, authenticated, service_role;
revoke all on function public.mkc_react(p_id bigint, p_emoji text, p_on boolean) from public, anon, authenticated; grant execute on function public.mkc_react(p_id bigint, p_emoji text, p_on boolean) to authenticated, service_role;
revoke all on function public.mkc_read(other uuid) from public, anon, authenticated; grant execute on function public.mkc_read(other uuid) to authenticated, service_role;
revoke all on function public.mkc_replies(p_id bigint) from public, anon, authenticated; grant execute on function public.mkc_replies(p_id bigint) to authenticated, service_role;
revoke all on function public.mkc_report(other uuid, reason text) from public, anon, authenticated; grant execute on function public.mkc_report(other uuid, reason text) to authenticated, service_role;
revoke all on function public.mkc_send(other uuid, p_kind text, p_body text) from public, anon, authenticated; grant execute on function public.mkc_send(other uuid, p_kind text, p_body text) to authenticated, service_role;
revoke all on function public.mkc_set_me(p_username text, p_name text, p_avatar text, p_findable boolean, p_calls text) from public, anon, authenticated; grant execute on function public.mkc_set_me(p_username text, p_name text, p_avatar text, p_findable boolean, p_calls text) to authenticated, service_role;
revoke all on function public.mkc_social() from public, anon, authenticated; grant execute on function public.mkc_social() to authenticated, service_role;
revoke all on function public.mkc_srv_trophies(uid uuid) from public, anon, authenticated; grant execute on function public.mkc_srv_trophies(uid uuid) to service_role;
revoke all on function public.mkc_staff_is(uid uuid) from public, anon, authenticated; grant execute on function public.mkc_staff_is(uid uuid) to service_role;
revoke all on function public.mkc_stats(j jsonb) from public, anon, authenticated; grant execute on function public.mkc_stats(j jsonb) to anon, authenticated, service_role;
revoke all on function public.mkc_status_me() from public, anon, authenticated; grant execute on function public.mkc_status_me() to authenticated, service_role;
revoke all on function public.mkc_status_set(p_mood text, p_text text, p_hours integer) from public, anon, authenticated; grant execute on function public.mkc_status_set(p_mood text, p_text text, p_hours integer) to authenticated, service_role;
revoke all on function public.mkc_title(j jsonb) from public, anon, authenticated; grant execute on function public.mkc_title(j jsonb) to anon, authenticated, service_role;
revoke all on function public.mkc_titles(j jsonb, maxn integer) from public, anon, authenticated; grant execute on function public.mkc_titles(j jsonb, maxn integer) to anon, authenticated, service_role;
revoke all on function public.mkc_trophies(j jsonb) from public, anon, authenticated; grant execute on function public.mkc_trophies(j jsonb) to anon, authenticated, service_role;
revoke all on function public.mkc_txt(j jsonb, n integer) from public, anon, authenticated; grant execute on function public.mkc_txt(j jsonb, n integer) to anon, authenticated, service_role;
revoke all on function public.mkc_usage_add(d text, dev text, lang text, cc text, rows jsonb) from public, anon, authenticated; grant execute on function public.mkc_usage_add(d text, dev text, lang text, cc text, rows jsonb) to anon, authenticated, service_role;
revoke all on function public.mkc_uuid(t text) from public, anon, authenticated; grant execute on function public.mkc_uuid(t text) to anon, authenticated, service_role;
revoke all on function public.mkcinema_delete_me() from public, anon, authenticated; grant execute on function public.mkcinema_delete_me() to authenticated, service_role;
revoke all on function public.mkcinema_is_owner() from public, anon, authenticated; grant execute on function public.mkcinema_is_owner() to anon, authenticated, service_role;
revoke all on function public.mkcinema_logs_guard() from public, anon, authenticated; grant execute on function public.mkcinema_logs_guard() to service_role;
revoke all on function public.mkcinema_profiles_stamp() from public, anon, authenticated; grant execute on function public.mkcinema_profiles_stamp() to anon, authenticated, service_role;
