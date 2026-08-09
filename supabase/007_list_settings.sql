-- Things — later additions
--
-- Run once in the SQL Editor if your database predates these features.
-- Safe to run more than once.

-- How long finished to-dos and bought shopping items stick around before the
-- app clears them. 0 disables clearing. Shared, because it changes the data
-- both of you see rather than just how it looks.
alter table household_settings
  add column if not exists auto_clear_days integer not null default 7;

-- Which recurrence presets each person wants as quick picks, by label.
-- An empty array means "show the built-in set".
alter table profile_settings
  add column if not exists recurrence_presets jsonb not null default '[]'::jsonb;
