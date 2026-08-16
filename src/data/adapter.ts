import type {
  ActivityLog,
  Chore,
  HouseholdSettings,
  Profile,
  ProfileSettings,
  ShoppingItem,
  ShoppingTrip,
  Store,
  Todo,
  WishlistItem,
} from './types'

/** Every synced collection. Realtime binds one handler per entry. */
export const TABLES = [
  'todos',
  'chores',
  'shopping_items',
  'stores',
  'wishlist_items',
  'profiles',
  'profile_settings',
  'household_settings',
  'shopping_trips',
  'activity_log',
] as const

export type TableName = (typeof TABLES)[number]

export interface TableMap {
  todos: Todo
  chores: Chore
  shopping_items: ShoppingItem
  stores: Store
  wishlist_items: WishlistItem
  profiles: Profile
  profile_settings: ProfileSettings
  household_settings: HouseholdSettings
  shopping_trips: ShoppingTrip
  activity_log: ActivityLog
}

export type ChangeEvent<T extends TableName = TableName> =
  | { table: T; type: 'insert' | 'update'; row: TableMap[T] }
  | { table: T; type: 'delete'; id: string }

export type ChangeHandler = (event: ChangeEvent) => void

/**
 * Result of an atomic claim. Claiming is a genuine race between two phones, so
 * it is never read-then-write — the database arbitrates via a conditional
 * update and `won: false` means the other person got there first.
 */
export interface ClaimResult<T> {
  won: boolean
  row?: T
}

export interface DataAdapter {
  readonly kind: 'local' | 'supabase'

  list<T extends TableName>(table: T): Promise<TableMap[T][]>
  insert<T extends TableName>(table: T, row: TableMap[T]): Promise<TableMap[T]>
  update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<TableMap[T]>,
  ): Promise<TableMap[T] | null>
  remove(table: TableName, id: string): Promise<void>

  /** Conditional update: only succeeds while `claimed_by` is still null. */
  claim<T extends 'todos' | 'chores' | 'shopping_items'>(
    table: T,
    id: string,
    profileId: string,
  ): Promise<ClaimResult<TableMap[T]>>

  /** Release your own claim. No-op if someone else holds it. */
  unclaim<T extends 'todos' | 'chores' | 'shopping_items'>(
    table: T,
    id: string,
    profileId: string,
  ): Promise<TableMap[T] | null>

  /**
   * Guarded completion for recurring chores — advances the cooldown only if
   * `last_completed_at` still matches what the caller last saw, so simultaneous
   * taps from both phones can't double-advance it.
   */
  completeRecurring(
    id: string,
    profileId: string,
    seenLastCompletedAt: string | null,
  ): Promise<ClaimResult<Chore>>

  subscribe(onChange: ChangeHandler, onResync: () => void): () => void
}

/**
 * The key a row is addressed by. Two tables are not keyed on `id`, and getting
 * this wrong is silent: a lookup that never matches just reports "no such row"
 * rather than throwing, so writes appear to succeed and vanish. Defined once
 * here so the store and every adapter agree.
 */
export function rowKey(table: TableName, row: unknown): string {
  if (table === 'household_settings') return 'singleton'
  if (table === 'profile_settings') return (row as { profile_id: string }).profile_id
  return (row as { id: string }).id
}

/** Client-side IDs so an optimistic row and its realtime echo share identity. */
export const newId = (): string => crypto.randomUUID()

export const nowIso = (): string => new Date().toISOString()
