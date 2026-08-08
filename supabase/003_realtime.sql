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
