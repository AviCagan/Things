// Single source of truth for every shape that crosses the wire.
// `urgency` and `desire` are smallints with CHECK constraints in Postgres
// rather than enums, so widening them later doesn't need a migration.

export type ProfileSlug = 'avi' | 'jackie'

/**
 * Three levels, read as a traffic light. The database still allows 0–3 from
 * when there were four, so anything stored as 3 is clamped on the way in
 * rather than migrated — old rows keep working and nothing needs backfilling.
 */
export const URGENCY = { LOW: 0, MEDIUM: 1, URGENT: 2 } as const
export type Urgency = 0 | 1 | 2

export const URGENCY_LEVELS: Urgency[] = [0, 1, 2]

export const URGENCY_META: Record<Urgency, { label: string; short: string }> = {
  0: { label: 'Low', short: 'Low' },
  1: { label: 'Medium', short: 'Med' },
  2: { label: 'Urgent', short: 'Urgent' },
}

/** Fold legacy 3s down to the new top level. */
export const normalizeUrgency = (value: number): Urgency =>
  (value >= 2 ? 2 : value <= 0 ? 0 : 1) as Urgency

export type Desire = 1 | 2 | 3 | 4 | 5

export const DESIRE_META: Record<Desire, { label: string }> = {
  1: { label: 'Someday' },
  2: { label: 'Would be nice' },
  3: { label: 'Want it' },
  4: { label: 'Really want it' },
  5: { label: 'Must have' },
}

export type RecurrenceUnit = 'hours' | 'days' | 'weeks' | 'months' | 'years'
export type ThemeMode = 'system' | 'light' | 'dark' | 'oled'
export type HapticIntensity = 'off' | 'subtle' | 'normal' | 'heavy'
export type NavApp = 'google' | 'waze' | 'apple'

export interface Profile {
  id: string
  slug: ProfileSlug
  display_name: string
  avatar_emoji: string
  /**
   * Optional photo, held as a data URI. Two people do not justify configuring
   * a storage bucket, and the image is downscaled hard before it is saved.
   */
  avatar_url: string | null
  color_hex: string
  created_at: string
}

export type NotifyEvent =
  | 'claim_complete'
  | 'cooldown_ready'
  | 'urgent_added'
  | 'any_added'

export interface ProfileSettings {
  profile_id: string
  theme_mode: ThemeMode
  accent_hex: string
  font_scale: number
  haptic_intensity: HapticIntensity
  /** Per-event opt-outs. Absent key = enabled. */
  haptic_events: Partial<Record<HapticEventName, boolean>>
  sound_enabled: boolean
  reduce_motion: boolean
  /** iOS 17.4+ `<input type="checkbox" switch>` haptic hack. Off by default. */
  ios_native_switch: boolean
  nav_app: NavApp
  notify_events: Partial<Record<NotifyEvent, boolean>>
  /**
   * Which recurrence presets show as quick picks, by label. Empty means the
   * built-in default set.
   */
  recurrence_presets: string[]
  /** Reserved so SMS can be added later without a migration. */
  phone_e164: string | null
  updated_at: string
}

export type HapticEventName =
  | 'tap'
  | 'toggleOn'
  | 'toggleOff'
  | 'claim'
  | 'complete'
  | 'delete'
  | 'swipeThreshold'
  | 'longPress'
  | 'dragStart'
  | 'snap'
  | 'success'
  | 'warning'
  | 'error'

export interface HouseholdSettings {
  singleton: true
  home_label: string | null
  home_address: string | null
  home_lat: number | null
  home_lng: number | null
  /**
   * Days to keep finished to-dos and bought shopping items before they are
   * removed. 0 disables clearing entirely. Shared, because it changes the
   * data both of you see rather than just how it looks.
   */
  auto_clear_days: number
  updated_at: string
}

/** Fields shared by todos, chores and shopping items. */
interface ListItemBase {
  id: string
  title: string
  urgency: Urgency
  claimed_by: string | null
  created_by: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Todo extends ListItemBase {
  notes: string | null
  is_done: boolean
  completed_by: string | null
  completed_at: string | null
}

export interface Chore extends ListItemBase {
  notes: string | null
  is_recurring: boolean
  recurrence_count: number | null
  recurrence_unit: RecurrenceUnit | null
  last_completed_at: string | null
  last_completed_by: string | null
  /** Maintained by a DB trigger — generated columns can't do this (see plan). */
  next_due_at: string | null
  cooldown_notified_at: string | null
  is_done: boolean
}

export interface Store {
  id: string
  name: string
  /** Online stores are excluded from trip planning and carry no coordinates. */
  is_online: boolean
  url: string | null
  address: string | null
  lat: number | null
  lng: number | null
  geocoded_at: string | null
  geocode_source: 'photon' | 'nominatim' | 'manual' | null
  color_hex: string
  emoji: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ShoppingItem extends ListItemBase {
  store_id: string | null
  quantity: string | null
  is_done: boolean
  completed_at: string | null
}

export interface WishlistItem {
  id: string
  title: string
  notes: string | null
  url: string | null
  price_cents: number | null
  image_url: string | null
  desire_level: Desire
  owner_id: string | null
  is_purchased: boolean
  purchased_at: string | null
  created_by: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TripStop {
  store_id: string
  name: string
  lat: number
  lng: number
  address: string | null
  overridden: boolean
}

export interface ShoppingTrip {
  id: string
  created_by: string | null
  stops: TripStop[]
  ordered_index: number[]
  total_distance_m: number | null
  total_duration_s: number | null
  routed_with: 'osrm' | 'haversine'
  created_at: string
}

export type TabKey = 'todos' | 'chores' | 'shopping' | 'wishlist'
