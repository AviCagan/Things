import { get, set } from 'idb-keyval'
import type { ChangeHandler, DataAdapter, TableMap, TableName } from './adapter'
import { TABLES, nowIso } from './adapter'
import type { Chore } from './types'

/**
 * IndexedDB-backed adapter.
 *
 * This is not a stub — it is the entire backend until Supabase credentials
 * exist, which keeps the app fully usable on day one and forces the offline
 * path to actually work rather than being bolted on at the end.
 */

const KEY = 'things:local:v1'

type Db = { [K in TableName]: TableMap[K][] }

const emptyDb = (): Db =>
  Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Db

let cache: Db | null = null
let writeChain: Promise<void> = Promise.resolve()

async function load(): Promise<Db> {
  if (cache) return cache
  const stored = await get<Db>(KEY)
  cache = stored ? { ...emptyDb(), ...stored } : emptyDb()
  return cache
}

/** Serialise writes so concurrent mutations can't clobber each other. */
function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    if (cache) await set(KEY, cache)
  })
  return writeChain
}

const listeners = new Set<ChangeHandler>()

function emit(event: Parameters<ChangeHandler>[0]) {
  for (const l of listeners) l(event)
}

export function createLocalAdapter(): DataAdapter {
  return {
    kind: 'local',

    async list(table) {
      const db = await load()
      return [...db[table]] as never
    },

    async insert(table, row) {
      const db = await load()
      ;(db[table] as unknown[]).push(row)
      await persist()
      emit({ table, type: 'insert', row } as never)
      return row
    },

    async update(table, id, patch) {
      const db = await load()
      const rows = db[table] as Array<{ id?: string; singleton?: boolean }>
      const idx = rows.findIndex((r) => (r.id ?? String(r.singleton)) === id)
      if (idx < 0) return null
      const next = { ...rows[idx], ...patch, updated_at: nowIso() }
      rows[idx] = next as never
      await persist()
      emit({ table, type: 'update', row: next } as never)
      return next as never
    },

    async remove(table, id) {
      const db = await load()
      const rows = db[table] as Array<{ id?: string }>
      const idx = rows.findIndex((r) => r.id === id)
      if (idx < 0) return
      rows.splice(idx, 1)
      await persist()
      emit({ table, type: 'delete', id })
    },

    async claim(table, id, profileId) {
      const db = await load()
      const rows = db[table] as Array<{ id: string; claimed_by: string | null }>
      const row = rows.find((r) => r.id === id)
      if (!row) return { won: false }
      // Mirrors the server's conditional update so both adapters behave alike.
      if (row.claimed_by !== null) return { won: false, row: row as never }
      row.claimed_by = profileId
      ;(row as { updated_at?: string }).updated_at = nowIso()
      await persist()
      emit({ table, type: 'update', row } as never)
      return { won: true, row: row as never }
    },

    async unclaim(table, id, profileId) {
      const db = await load()
      const rows = db[table] as Array<{ id: string; claimed_by: string | null }>
      const row = rows.find((r) => r.id === id)
      if (!row || row.claimed_by !== profileId) return null
      row.claimed_by = null
      ;(row as { updated_at?: string }).updated_at = nowIso()
      await persist()
      emit({ table, type: 'update', row } as never)
      return row as never
    },

    async completeRecurring(id, profileId, seenLastCompletedAt) {
      const db = await load()
      const rows = db.chores as Chore[]
      const row = rows.find((r) => r.id === id)
      if (!row) return { won: false }
      if ((row.last_completed_at ?? null) !== seenLastCompletedAt) {
        return { won: false, row }
      }
      row.last_completed_at = nowIso()
      row.last_completed_by = profileId
      row.claimed_by = null
      row.cooldown_notified_at = null
      row.next_due_at = computeNextDue(row)
      row.updated_at = nowIso()
      await persist()
      emit({ table: 'chores', type: 'update', row })
      return { won: true, row }
    },

    subscribe(onChange) {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
  } satisfies DataAdapter as DataAdapter
}

/**
 * Local mirror of the Postgres `compute_next_due()` trigger, so a chore behaves
 * identically before and after Supabase is wired up.
 */
export function computeNextDue(chore: Chore): string | null {
  if (!chore.is_recurring || !chore.last_completed_at) return null
  if (!chore.recurrence_count || !chore.recurrence_unit) return null

  const d = new Date(chore.last_completed_at)
  const n = chore.recurrence_count
  switch (chore.recurrence_unit) {
    case 'hours':
      d.setHours(d.getHours() + n)
      break
    case 'days':
      d.setDate(d.getDate() + n)
      break
    case 'weeks':
      d.setDate(d.getDate() + n * 7)
      break
    case 'months':
      // Calendar-correct: this is why recurrence is (count, unit) and not
      // raw seconds. "Monthly" must mean the same day next month, not +30d.
      d.setMonth(d.getMonth() + n)
      break
  }
  return d.toISOString()
}
