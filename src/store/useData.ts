import { create } from 'zustand'
import { toast } from 'sonner'
import type { ChangeEvent, DataAdapter, TableMap, TableName } from '@/data/adapter'
import { TABLES, newId, nowIso } from '@/data/adapter'
import { createLocalAdapter, computeNextDue } from '@/data/localAdapter'
import type {
  Chore,
  RecurrenceUnit,
  ShoppingItem,
  Store as ShopStore,
  Todo,
  Urgency,
  Weekday,
  WishlistItem,
  Desire,
} from '@/data/types'

/**
 * What the add-chore UI hands over: either an interval ("every 3 days") or a
 * fixed set of weekdays ("Tue & Wed") — never both, matching the database's
 * own recurrence_complete constraint.
 */
export type Recurrence =
  | { unit: Exclude<RecurrenceUnit, 'weekdays'>; count: number }
  | { unit: 'weekdays'; days: Weekday[] }
import { fire } from '@/lib/haptics'
import { scheduleCooldownReminder, cancelCooldownReminder } from '@/lib/notifications'

type Collections = { [K in TableName]: TableMap[K][] }

const emptyCollections = (): Collections =>
  Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Collections

interface DataState extends Collections {
  adapter: DataAdapter
  ready: boolean
  connection: 'local' | 'live' | 'offline'
  pendingCount: number

  init: () => Promise<void>
  setAdapter: (adapter: DataAdapter) => Promise<void>
  refetchAll: () => Promise<void>
  applyChange: (event: ChangeEvent) => void
}

/** Rows are keyed by `id`; settings tables use a fixed key. */
function rowKey(table: TableName, row: unknown): string {
  if (table === 'household_settings') return 'singleton'
  if (table === 'profile_settings')
    return (row as { profile_id: string }).profile_id
  return (row as { id: string }).id
}

export const useData = create<DataState>((set, get) => ({
  ...emptyCollections(),
  adapter: createLocalAdapter(),
  ready: false,
  connection: 'local',
  pendingCount: 0,

  async init() {
    await get().refetchAll()
    const { adapter } = get()
    adapter.subscribe(
      (event) => get().applyChange(event),
      () => void get().refetchAll(),
    )
    set({ ready: true })
  },

  async setAdapter(adapter) {
    set({ adapter, ready: false })
    await get().refetchAll()
    adapter.subscribe(
      (event) => get().applyChange(event),
      () => void get().refetchAll(),
    )
    set({ ready: true, connection: adapter.kind === 'supabase' ? 'live' : 'local' })
  },

  /**
   * Full replace rather than reconciliation. Supabase does not replay events
   * missed while disconnected, so on every (re)subscribe the only thing that
   * guarantees convergence is refetching outright — and at household scale
   * that's a few hundred rows.
   */
  async refetchAll() {
    const { adapter } = get()
    const entries = await Promise.all(
      TABLES.map(async (t) => [t, await adapter.list(t)] as const),
    )
    set(Object.fromEntries(entries) as unknown as Collections)
  },

  applyChange(event) {
    const table = event.table
    const current = get()[table] as unknown[]

    if (event.type === 'delete') {
      set({
        [table]: current.filter((r) => rowKey(table, r) !== event.id),
      } as unknown as Partial<DataState>)
      return
    }

    // Pure upsert-by-key, so the echo of our own optimistic write is a no-op
    // and event ordering never matters.
    const key = rowKey(table, event.row)
    const idx = current.findIndex((r) => rowKey(table, r) === key)
    const next =
      idx >= 0
        ? current.map((r, i) => (i === idx ? event.row : r))
        : [...current, event.row]

    set({ [table]: next } as unknown as Partial<DataState>)
  },
}))

// --- mutation helpers -------------------------------------------------------

/**
 * Optimistic write: apply locally and fire the haptic immediately, then hit the
 * network. The UI never waits on a round-trip. On failure we roll back to the
 * snapshot rather than trying to invert the patch.
 */
async function optimistic<T extends TableName>(
  table: T,
  apply: () => void,
  commit: () => Promise<unknown>,
  rollbackTo: TableMap[T][],
  failMessage: string,
) {
  apply()
  try {
    await commit()
  } catch (err) {
    useData.setState({ [table]: rollbackTo } as unknown as Partial<DataState>)
    fire('error')
    toast.error(failMessage)
    console.error(`[${table}]`, err)
  }
}

function baseFields(profileId: string | null) {
  return {
    id: newId(),
    claimed_by: null,
    created_by: profileId,
    updated_by: null,
    sort_order: Date.now(),
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export const dataActions = {
  // --- todos ---------------------------------------------------------------

  async addTodo(title: string, urgency: Urgency, profileId: string | null) {
    const row: Todo = {
      ...baseFields(profileId),
      title: title.trim(),
      notes: null,
      urgency,
      is_done: false,
      completed_by: null,
      completed_at: null,
    }
    const snapshot = useData.getState().todos
    fire('tap')
    await optimistic(
      'todos',
      () => useData.setState({ todos: [...snapshot, row] }),
      () => useData.getState().adapter.insert('todos', row),
      snapshot,
      "Couldn't add that",
    )
  },

  async toggleTodo(todo: Todo, profileId: string | null) {
    const done = !todo.is_done
    const patch: Partial<Todo> = {
      is_done: done,
      completed_at: done ? nowIso() : null,
      completed_by: done ? profileId : null,
    }
    fire(done ? 'complete' : 'toggleOff')
    await patchRow('todos', todo.id, patch)
  },

  // --- chores --------------------------------------------------------------

  async addChore(
    title: string,
    urgency: Urgency,
    profileId: string | null,
    recurrence: Recurrence | null,
  ) {
    const row: Chore = {
      ...baseFields(profileId),
      title: title.trim(),
      notes: null,
      urgency,
      is_recurring: recurrence !== null,
      recurrence_count: recurrence && recurrence.unit !== 'weekdays' ? recurrence.count : null,
      recurrence_unit: recurrence?.unit ?? null,
      recurrence_days: recurrence && recurrence.unit === 'weekdays' ? recurrence.days : null,
      last_completed_at: null,
      last_completed_by: null,
      next_due_at: null,
      cooldown_notified_at: null,
      is_done: false,
    }
    const snapshot = useData.getState().chores
    fire('tap')
    await optimistic(
      'chores',
      () => useData.setState({ chores: [...snapshot, row] }),
      () => useData.getState().adapter.insert('chores', row),
      snapshot,
      "Couldn't add that chore",
    )
  },

  /**
   * Completing a recurring chore is not `is_done = true` — the row stays alive
   * and starts a cooldown. Guarded so both phones tapping at once can't
   * double-advance it.
   */
  async completeChore(chore: Chore, profileId: string | null) {
    if (!chore.is_recurring) {
      const done = !chore.is_done
      fire(done ? 'complete' : 'toggleOff')
      await patchRow('chores', chore.id, { is_done: done })
      return
    }

    fire('complete')
    const snapshot = useData.getState().chores
    const optimisticRow: Chore = {
      ...chore,
      last_completed_at: nowIso(),
      last_completed_by: profileId,
      claimed_by: null,
      cooldown_notified_at: null,
      updated_at: nowIso(),
    }
    optimisticRow.next_due_at = computeNextDue(optimisticRow)

    useData.setState({
      chores: snapshot.map((c) => (c.id === chore.id ? optimisticRow : c)),
    })

    try {
      const result = await useData
        .getState()
        .adapter.completeRecurring(
          chore.id,
          profileId ?? '',
          chore.last_completed_at,
        )
      if (!result.won) {
        useData.setState({ chores: snapshot })
        fire('warning')
        toast('Already done', { description: 'Someone beat you to it.' })
        return
      }
      // Native devices can schedule the "ready again" alert themselves, with
      // exact timing and no server involved. Non-native falls back to the
      // pg_cron sweep, since a browser can't schedule anything locally.
      void scheduleCooldownReminder(result.row ?? optimisticRow)
    } catch (err) {
      useData.setState({ chores: snapshot })
      fire('error')
      toast.error("Couldn't complete that")
      console.error(err)
    }
  },

  // --- shopping ------------------------------------------------------------

  async addShoppingItem(
    title: string,
    urgency: Urgency,
    storeId: string | null,
    profileId: string | null,
    quantity: string | null = null,
    extra: Partial<ShoppingItem> = {},
  ) {
    const row: ShoppingItem = {
      ...baseFields(profileId),
      title: title.trim(),
      urgency,
      store_id: storeId,
      quantity,
      is_done: false,
      completed_at: null,
      url: null,
      image_url: null,
      price_cents: null,
      ...extra,
    }
    const snapshot = useData.getState().shopping_items
    fire('tap')
    await optimistic(
      'shopping_items',
      () => useData.setState({ shopping_items: [...snapshot, row] }),
      () => useData.getState().adapter.insert('shopping_items', row),
      snapshot,
      "Couldn't add that",
    )
  },

  async toggleShoppingItem(item: ShoppingItem) {
    const done = !item.is_done
    fire(done ? 'complete' : 'toggleOff')
    await patchRow('shopping_items', item.id, {
      is_done: done,
      completed_at: done ? nowIso() : null,
    })
  },

  async addStore(store: Omit<ShopStore, 'id' | 'created_at' | 'updated_at' | 'sort_order'>) {
    const row: ShopStore = {
      ...store,
      id: newId(),
      sort_order: Date.now(),
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    const snapshot = useData.getState().stores
    fire('tap')
    await optimistic(
      'stores',
      () => useData.setState({ stores: [...snapshot, row] }),
      () => useData.getState().adapter.insert('stores', row),
      snapshot,
      "Couldn't add that store",
    )
    return row
  },

  // --- wishlist ------------------------------------------------------------

  async addWish(
    title: string,
    desire: Desire,
    profileId: string | null,
    extra: Partial<WishlistItem> = {},
  ) {
    const row: WishlistItem = {
      id: newId(),
      title: title.trim(),
      notes: null,
      url: null,
      price_cents: null,
      image_url: null,
      desire_level: desire,
      owner_id: profileId,
      is_purchased: false,
      purchased_at: null,
      created_by: profileId,
      updated_by: null,
      sort_order: Date.now(),
      created_at: nowIso(),
      updated_at: nowIso(),
      ...extra,
    }
    const snapshot = useData.getState().wishlist_items
    fire('tap')
    await optimistic(
      'wishlist_items',
      () => useData.setState({ wishlist_items: [...snapshot, row] }),
      () => useData.getState().adapter.insert('wishlist_items', row),
      snapshot,
      "Couldn't add that",
    )
  },

  // --- shared --------------------------------------------------------------

  /**
   * Claiming is a race between two phones. Never read-then-write: the adapter
   * issues a conditional update and the database decides the winner.
   */
  async toggleClaim(
    table: 'todos' | 'chores' | 'shopping_items',
    id: string,
    profileId: string,
    currentClaim: string | null,
    claimantName: (id: string) => string,
  ) {
    const adapter = useData.getState().adapter
    const snapshot = useData.getState()[table] as Array<{ id: string; claimed_by: string | null }>

    if (currentClaim === profileId) {
      fire('toggleOff')
      applyLocal(table, id, { claimed_by: null })
      try {
        await adapter.unclaim(table, id, profileId)
      } catch {
        useData.setState({ [table]: snapshot } as unknown as Partial<DataState>)
      }
      return
    }

    if (currentClaim !== null) {
      fire('warning')
      toast(`${claimantName(currentClaim)} has this one`)
      return
    }

    fire('claim')
    applyLocal(table, id, { claimed_by: profileId })
    try {
      const result = await adapter.claim(table, id, profileId)
      if (!result.won) {
        useData.setState({ [table]: snapshot } as unknown as Partial<DataState>)
        fire('warning')
        const holder = result.row?.claimed_by
        toast(holder ? `${claimantName(holder)} got there first` : 'Already claimed')
      }
    } catch {
      useData.setState({ [table]: snapshot } as unknown as Partial<DataState>)
      fire('error')
    }
  },

  async remove(table: TableName, id: string) {
    const snapshot = useData.getState()[table] as unknown[]
    fire('delete')
    // Don't leave a reminder scheduled for a chore that no longer exists.
    if (table === 'chores') void cancelCooldownReminder(id)
    await optimistic(
      table,
      () =>
        useData.setState({
          [table]: snapshot.filter((r) => rowKey(table, r) !== id),
        } as unknown as Partial<DataState>),
      () => useData.getState().adapter.remove(table, id),
      snapshot as never,
      "Couldn't delete that",
    )
  },

  patchRow,
}

function applyLocal(table: TableName, id: string, patch: Record<string, unknown>) {
  const rows = useData.getState()[table] as unknown[]
  useData.setState({
    [table]: rows.map((r) =>
      rowKey(table, r) === id ? { ...(r as object), ...patch } : r,
    ),
  } as unknown as Partial<DataState>)
}

async function patchRow<T extends TableName>(
  table: T,
  id: string,
  patch: Partial<TableMap[T]>,
) {
  const snapshot = useData.getState()[table] as TableMap[T][]
  await optimistic(
    table,
    () => applyLocal(table, id, { ...patch, updated_at: nowIso() }),
    () => useData.getState().adapter.update(table, id, patch),
    snapshot,
    "Couldn't save that",
  )
}
