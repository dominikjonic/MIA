-- Minuten-Takt: ruft die Edge Function /dom/tick auf (Erinnerungen, Terminhinweise, Tagesbriefing, Visualisierungen).
-- Projekt-Referenz bei einer Neuinstallation anpassen.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('dom-tick', '* * * * *', $job$
  select net.http_post(
    url := 'https://dvtklaupmioxheelndnq.supabase.co/functions/v1/dom/tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from public.internal_settings where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$job$);

select cron.schedule('dom-cleanup', '17 3 * * *', 'delete from cron.job_run_details where end_time < now() - interval ''3 days''');
