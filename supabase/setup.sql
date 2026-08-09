-- Things — complete database setup, in one paste.
--
-- Copy this whole file into the Supabase SQL Editor and hit Run, once.
-- It is the same content as 001–004 run in order; those are kept separate
-- for readability, this is here so setup is a single step.
--
-- Safe to run more than once: every statement is idempotent.


-- ==========================================================================
-- 001_schema.sql
-- ==========================================================================

-- Things — schema
-- Run this in the Supabase SQL editor, then 002_rls.sql, 003_realtime.sql,
-- 004_seed.sql in order. See supabase/README.md for the full setup.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
--
-- These are APP-level identities, deliberately decoupled from Supabase Auth.
-- Both phones share one auth account (unlocked once by the PIN), while "who am
-- I" stays a pure tap-your-name choice stored on the device. That is what lets
-- the login screen have no passwords while the database still refuses anon.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key,
  slug         text unique not null check (slug in ('avi', 'jackie')),
  display_name text not null,
  avatar_emoji text not null default '🙂',
  -- Optional photo as a data URI; two users don't justify a storage bucket.
  avatar_url   text,
  color_hex    text not null default '#7c5cff',
  created_at   timestamptz not null default now()
);

create table if not exists profile_settings (
  profile_id        uuid primary key references profiles(id) on delete cascade,
  theme_mode        text not null default 'system'
                      check (theme_mode in ('system','light','dark','oled')),
  accent_hex        text not null default '#7c5cff',
  font_scale        numeric(3,2) not null default 1.00
                      check (font_scale between 0.80 and 1.40),
  haptic_intensity  text not null default 'heavy'
                      check (haptic_intensity in ('off','subtle','normal','heavy')),
  -- Per-event opt-outs, e.g. {"snap": false}. Absent key means enabled.
  haptic_events     jsonb not null default '{}'::jsonb,
  sound_enabled     boolean not null default false,
  reduce_motion     boolean not null default false,
  ios_native_switch boolean not null default false,
  nav_app           text not null default 'google'
                      check (nav_app in ('google','waze','apple')),
  notify_events     jsonb not null default '{}'::jsonb,
  -- Recurrence quick picks, by label. Empty = the built-in set.
  recurrence_presets jsonb not null default '[]'::jsonb,
  -- Unused today. Reserved so SMS can be added without a migration if iOS
  -- Web Push disappoints in practice.
  phone_e164        text,
  updated_at        timestamptz not null default now()
);

-- Single shared row. The CHECK pins it to exactly one.
create table if not exists household_settings (
  singleton    boolean primary key default true check (singleton),
  home_label   text,
  home_address text,
  home_lat     double precision,
  home_lng     double precision,
  -- Days to keep finished items. 0 disables clearing.
  auto_clear_days integer not null default 7,
  -- Secret in the calendar feed URL. null = calendar sync off.
  calendar_token text,
  -- Minutes of warning the calendar gives before a chore is due. 0 = none.
  calendar_alarm_minutes integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lists
--
-- `urgency` is a smallint + CHECK rather than a Postgres enum: enums need a
-- migration to extend and can't be altered inside a transaction. The TS union
-- in src/data/types.ts is the single source of truth.
-- ---------------------------------------------------------------------------
create table if not exists todos (
  id           uuid primary key,
  title        text not null check (length(trim(title)) > 0),
  notes        text,
  urgency      smallint not null default 1 check (urgency between 0 and 3),
  is_done      boolean not null default false,
  claimed_by   uuid references profiles(id) on delete set null,
  created_by   uuid references profiles(id) on delete set null,
  completed_by uuid references profiles(id) on delete set null,
  completed_at timestamptz,
  sort_order   double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists chores (
  id                uuid primary key,
  title             text not null check (length(trim(title)) > 0),
  notes             text,
  urgency           smallint not null default 1 check (urgency between 0 and 3),
  claimed_by        uuid references profiles(id) on delete set null,
  created_by        uuid references profiles(id) on delete set null,

  is_recurring      boolean not null default false,
  recurrence_count  integer check (recurrence_count > 0),
  recurrence_unit   text check (recurrence_unit in ('hours','days','weeks','months','years')),

  last_completed_at timestamptz,
  last_completed_by uuid references profiles(id) on delete set null,
  -- Maintained by the trigger below. See the long comment there — this can NOT
  -- be a generated column.
  next_due_at       timestamptz,
  -- Set when a cooldown-ready notification has been sent, so the pg_cron sweep
  -- is idempotent and a retry can't double-notify.
  cooldown_notified_at timestamptz,

  -- One-off chores only; recurring chores never set this.
  is_done           boolean not null default false,

  sort_order        double precision not null default extract(epoch from now()),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint recurrence_complete check (
    (is_recurring and recurrence_count is not null and recurrence_unit is not null)
    or (not is_recurring and recurrence_count is null and recurrence_unit is null)
  )
);

create table if not exists stores (
  id             uuid primary key,
  name           text not null check (length(trim(name)) > 0),
  is_online      boolean not null default false,
  url            text,
  address        text,
  lat            double precision,
  lng            double precision,
  geocoded_at    timestamptz,
  geocode_source text check (geocode_source in ('photon','nominatim','manual')),
  color_hex      text not null default '#4a9d7e',
  emoji          text,
  sort_order     double precision not null default extract(epoch from now()),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Belt and braces: an online store can never carry coordinates, so it can
  -- never sneak into a driving route even if the UI filter were bypassed.
  constraint online_has_no_coords
    check (not is_online or (lat is null and lng is null))
);

create table if not exists shopping_items (
  id           uuid primary key,
  store_id     uuid references stores(id) on delete set null,
  title        text not null check (length(trim(title)) > 0),
  quantity     text,
  urgency      smallint not null default 1 check (urgency between 0 and 3),
  is_done      boolean not null default false,
  claimed_by   uuid references profiles(id) on delete set null,
  created_by   uuid references profiles(id) on delete set null,
  completed_at timestamptz,
  sort_order   double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists wishlist_items (
  id           uuid primary key,
  title        text not null check (length(trim(title)) > 0),
  notes        text,
  url          text,
  price_cents  integer check (price_cents >= 0),
  image_url    text,
  desire_level smallint not null default 3 check (desire_level between 1 and 5),
  owner_id     uuid references profiles(id) on delete set null,
  is_purchased boolean not null default false,
  purchased_at timestamptz,
  created_by   uuid references profiles(id) on delete set null,
  sort_order   double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Permanent geocode cache. Combined with denormalising lat/lng onto `stores`,
-- steady-state trip planning makes zero requests to the free geocoders.
create table if not exists geocode_cache (
  query_norm   text primary key,
  lat          double precision not null,
  lng          double precision not null,
  display_name text,
  provider     text not null,
  created_at   timestamptz not null default now()
);

create table if not exists shopping_trips (
  id               uuid primary key,
  created_by       uuid references profiles(id) on delete set null,
  stops            jsonb not null,
  ordered_index    integer[] not null,
  total_distance_m integer,
  total_duration_s integer,
  routed_with      text not null check (routed_with in ('osrm','haversine')),
  created_at       timestamptz not null default now()
);

-- One row per device per person; both of you can have several.
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  platform     text not null check (platform in ('fcm','webpush')),
  -- FCM registration token
  token        text,
  -- Web Push subscription
  endpoint     text,
  p256dh       text,
  auth         text,
  user_agent   text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint push_shape check (
    (platform = 'fcm'     and token    is not null) or
    (platform = 'webpush' and endpoint is not null and p256dh is not null and auth is not null)
  )
);

create unique index if not exists push_fcm_token_idx
  on push_subscriptions (token) where platform = 'fcm';
create unique index if not exists push_webpush_endpoint_idx
  on push_subscriptions (endpoint) where platform = 'webpush';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

/*
  next_due_at MUST be maintained by a trigger, not a generated column.

  Postgres requires GENERATED ALWAYS AS expressions to be IMMUTABLE, and the
  timestamptz + interval operator is only STABLE — adding days or months
  depends on the session TimeZone because of DST. So

      next_due_at timestamptz GENERATED ALWAYS AS
        (last_completed_at + make_interval(...)) STORED

  is rejected outright. The trigger below does the same job, and the stored
  column remains indexable and sortable.

  Note also what this column does NOT do: when a cooldown expires, no row
  changes, so Postgres emits no realtime event. Clients derive "is resting"
  themselves from next_due_at against a local ticker.
*/
create or replace function compute_next_due() returns trigger
language plpgsql as $$
begin
  if new.is_recurring and new.last_completed_at is not null then
    new.next_due_at := new.last_completed_at + make_interval(
      hours  => case when new.recurrence_unit = 'hours'  then new.recurrence_count else 0 end,
      days   => case when new.recurrence_unit = 'days'   then new.recurrence_count else 0 end,
      weeks  => case when new.recurrence_unit = 'weeks'  then new.recurrence_count else 0 end,
      months => case when new.recurrence_unit = 'months' then new.recurrence_count else 0 end
    );
  else
    new.next_due_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists chores_next_due on chores;
create trigger chores_next_due
  before insert or update on chores
  for each row execute function compute_next_due();

do $$
declare t text;
begin
  foreach t in array array[
    'todos','shopping_items','stores','wishlist_items',
    'profile_settings','household_settings'
  ] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format(
      'create trigger %I_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------------
create index if not exists todos_active_idx    on todos (is_done, urgency desc, sort_order);
create index if not exists chores_due_idx      on chores (next_due_at nulls first);
create index if not exists chores_active_idx   on chores (is_done, urgency desc, sort_order);
create index if not exists shopping_store_idx  on shopping_items (store_id, is_done, sort_order);
create index if not exists shopping_active_idx on shopping_items (is_done, urgency desc);
create index if not exists wishlist_desire_idx on wishlist_items (is_purchased, desire_level desc);
create index if not exists stores_routable_idx on stores (is_online, sort_order);
create index if not exists push_profile_idx    on push_subscriptions (profile_id);


-- ==========================================================================
-- 002_rls.sql
-- ==========================================================================

-- Things — row level security
--
-- The posture, stated plainly:
--
-- The anon key is NOT a secret. It ships inside the JS bundle, which GitHub
-- Pages serves publicly, so anyone who opens DevTools has it. The only real
-- question is what that key is ALLOWED to do.
--
-- Answer: nothing. Every policy below grants `authenticated` only, and `anon`
-- gets no policy at all. The two phones sign in once each to a single shared
-- household account (unlocked by the PIN), and supabase-js persists and
-- refreshes that session indefinitely — so day to day it is still just
-- "tap your name", and the database is not world-writable.
--
-- IMPORTANT companion step, in the Supabase dashboard:
--   Authentication → Providers → Email → turn OFF "Enable email signups".
-- Otherwise the public anon key can create brand new accounts, and those
-- accounts would then satisfy `to authenticated` and walk straight past the
-- PIN. That toggle is what makes this posture actually hold.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','profile_settings','household_settings',
    'todos','chores','stores','shopping_items','wishlist_items',
    'geocode_cache','shopping_trips','push_subscriptions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists household_rw on %I', t);
    execute format(
      'create policy household_rw on %I for all
         to authenticated using (true) with check (true)', t);
  end loop;
end $$;


-- ==========================================================================
-- 003_realtime.sql
-- ==========================================================================

-- Things — realtime

alter publication supabase_realtime add table todos;
alter publication supabase_realtime add table chores;
alter publication supabase_realtime add table shopping_items;
alter publication supabase_realtime add table stores;
alter publication supabase_realtime add table wishlist_items;
alter publication supabase_realtime add table profile_settings;
alter publication supabase_realtime add table household_settings;
alter publication supabase_realtime add table shopping_trips;

/*
  REPLICA IDENTITY FULL is required, not optional, and specifically because RLS
  is enabled.

  On DELETE, Realtime has to evaluate the row-level policy against the row that
  just disappeared. With the default (primary-key-only) replica identity it has
  too little of the row to do that, so it silently drops the event: inserts and
  updates sync fine, deletes never arrive on the other phone. That is the
  classic "deletes don't sync" bug, and this is the fix.
*/
alter table todos           replica identity full;
alter table chores          replica identity full;
alter table shopping_items  replica identity full;
alter table stores          replica identity full;
alter table wishlist_items  replica identity full;
alter table profile_settings replica identity full;
alter table household_settings replica identity full;


-- ==========================================================================
-- 004_seed.sql
-- ==========================================================================

-- Things — seed
--
-- Profile IDs are fixed constants, matching src/store/useProfile.ts. That way
-- claimed_by / created_by references made while the app was running purely on
-- the local adapter still resolve after the switch to Supabase.

insert into profiles (id, slug, display_name, avatar_emoji, color_hex) values
  ('11111111-1111-4111-8111-111111111111', 'avi',    'Avi',    '🦊', '#7c5cff'),
  ('22222222-2222-4222-8222-222222222222', 'jackie', 'Jackie', '🦋', '#ff6ea9')
on conflict (id) do nothing;

-- Jackie navigates with Waze, Avi with Google Maps. Both changeable in-app.
insert into profile_settings (profile_id, accent_hex, nav_app) values
  ('11111111-1111-4111-8111-111111111111', '#7c5cff', 'google'),
  ('22222222-2222-4222-8222-222222222222', '#ff6ea9', 'waze')
on conflict (profile_id) do nothing;

insert into household_settings (singleton, home_label) values (true, 'Home')
on conflict (singleton) do nothing;

