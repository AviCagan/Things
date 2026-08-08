-- Things — notification plumbing
--
-- Run AFTER deploying the Edge Function:
--   supabase functions deploy notify --no-verify-jwt
--
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> below before running.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Change notifications
--
-- These fire server-side, which is the point: notifying from the client would
-- send nothing whenever the acting person's app closes mid-write.
--
-- You can either create these as Database Webhooks in the dashboard
-- (Database → Webhooks → HTTP Request → the notify function), or use the
-- trigger below, which does the same thing in SQL and is easier to version.
-- ---------------------------------------------------------------------------

create or replace function notify_change() returns trigger
language plpgsql security definer as $$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'type',       tg_op,
    'table',      tg_table_name,
    'record',     case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );

  -- Fire-and-forget; pg_net does not block the transaction.
  perform net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := payload
  );

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['todos','chores','shopping_items','wishlist_items'] loop
    execute format('drop trigger if exists %I_notify on %I', t, t);
    execute format(
      'create trigger %I_notify after insert or update on %I
         for each row execute function notify_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Cooldown sweep
--
-- Recurring chores need a scheduled job rather than a trigger, because when a
-- cooldown expires NOTHING is written — there is no row change to hook. The
-- function's `cooldown_notified_at` bookkeeping makes repeated runs safe.
--
-- Avi's phone also schedules a local notification at completion time, which
-- needs no server at all and works offline; this sweep is what covers Jackie,
-- whose iOS PWA cannot schedule anything locally.
-- ---------------------------------------------------------------------------

select cron.unschedule('things-cooldown-sweep')
where exists (select 1 from cron.job where jobname = 'things-cooldown-sweep');

select cron.schedule(
  'things-cooldown-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := '{"mode":"sweep_cooldowns"}'::jsonb
  );
  $$
);
