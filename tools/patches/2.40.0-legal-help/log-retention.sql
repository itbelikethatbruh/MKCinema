-- MKCinema: delete sent logs (mkcinema_logs) older than 90 days, every night at 03:17 UTC.
-- Paste into Supabase > SQL Editor and press Run. Safe to run twice.
create extension if not exists pg_cron;
select cron.unschedule('mkcinema-logs-retention') where exists (select 1 from cron.job where jobname = 'mkcinema-logs-retention');
select cron.schedule('mkcinema-logs-retention', '17 3 * * *', $$delete from public.mkcinema_logs where created_at < now() - interval '90 days'$$);
-- check: select jobname, schedule, command from cron.job;
