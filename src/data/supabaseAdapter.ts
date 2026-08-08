import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ChangeHandler,
  ClaimResult,
  DataAdapter,
  TableMap,
  TableName,
} from './adapter'
import { TABLES } from './adapter'
import type { Chore } from './types'

/**
 * Supabase-backed adapter: REST for writes, one realtime channel for reads.
 */

/** Settings tables are keyed by something other than `id`. */
function keyColumn(table: TableName): string {
  if (table === 'profile_settings') return 'profile_id'
  if (table === 'household_settings') return 'singleton'
  return 'id'
}

function keyValue(table: TableName, id: string): string | boolean {
  if (table === 'household_settings') return true
  return id
}

/**
 * Minimal shape of the PostgREST query builder.
 *
 * Without generated database types (`supabase gen types`), the client infers a
 * `never` row shape and rejects partial updates outright. Rather than scatter
 * casts through every method, the builder is loosened once here at the
 * boundary — the DataAdapter interface above still types every call site.
 */
interface LooseQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: unknown): LooseQuery
  is(column: string, value: unknown): LooseQuery
  select(columns?: string): LooseQuery
  single(): LooseQuery
  maybeSingle(): LooseQuery
}

interface LooseTable {
  select(columns?: string): LooseQuery
  insert(row: unknown): LooseQuery
  update(patch: unknown): LooseQuery
  delete(): LooseQuery
}

export function createSupabaseAdapter(sb: SupabaseClient): DataAdapter {
  const from = (table: TableName): LooseTable =>
    sb.from(table) as unknown as LooseTable

  return {
    kind: 'supabase',

    async list(table) {
      const { data, error } = await from(table).select('*')
      if (error) throw error
      return (data ?? []) as never
    },

    async insert(table, row) {
      const { data, error } = await from(table).insert(row).select().single()
      if (error) throw error
      return data as never
    },

    async update(table, id, patch) {
      const { data, error } = await from(table)
        .update(patch)
        .eq(keyColumn(table), keyValue(table, id))
        .select()
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as never
    },

    async remove(table, id) {
      const { error } = await from(table)
        .delete()
        .eq(keyColumn(table), keyValue(table, id))
      if (error) throw error
    },

    /**
     * Conditional update — `.is('claimed_by', null)` makes the database the
     * arbiter. Zero rows back means the other person won the race, which is a
     * real outcome rather than an error.
     */
    async claim(table, id, profileId) {
      const { data, error } = await from(table)
        .update({ claimed_by: profileId })
        .eq('id', id)
        .is('claimed_by', null)
        .select()
      if (error) throw error

      const rows = (data ?? []) as unknown[]
      if (rows.length === 0) {
        // Fetch the winner so the UI can name them.
        const { data: current } = await from(table)
          .select('*')
          .eq('id', id)
          .maybeSingle()
        return { won: false, row: (current ?? undefined) as never }
      }
      return { won: true, row: rows[0] as never }
    },

    async unclaim(table, id, profileId) {
      const { data, error } = await from(table)
        .update({ claimed_by: null })
        .eq('id', id)
        .eq('claimed_by', profileId)
        .select()
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as never
    },

    /**
     * Guarded so two phones tapping "done" at the same moment can't advance the
     * cooldown twice. The filter pins the update to the state the caller saw.
     */
    async completeRecurring(id, profileId, seenLastCompletedAt) {
      const patch = {
        last_completed_at: new Date().toISOString(),
        last_completed_by: profileId,
        claimed_by: null,
        cooldown_notified_at: null,
      }

      let query = from('chores').update(patch).eq('id', id)
      query =
        seenLastCompletedAt === null
          ? query.is('last_completed_at', null)
          : query.eq('last_completed_at', seenLastCompletedAt)

      const { data, error } = await query.select()
      if (error) throw error
      const rows = (data ?? []) as Chore[]
      if (rows.length === 0) return { won: false }
      return { won: true, row: rows[0] }
    },

    subscribe(onChange: ChangeHandler, onResync: () => void) {
      const channel = sb.channel('household')

      for (const table of TABLES) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Record<string, unknown>
              const id =
                table === 'household_settings'
                  ? 'singleton'
                  : String(old[keyColumn(table)] ?? '')
              if (id) onChange({ table, type: 'delete', id })
              return
            }
            onChange({
              table,
              type: payload.eventType === 'INSERT' ? 'insert' : 'update',
              row: payload.new as TableMap[typeof table],
            })
          },
        )
      }

      channel.subscribe((status) => {
        // Supabase does not replay events missed while disconnected, so every
        // (re)subscribe triggers a full refetch. That is the only thing that
        // actually guarantees the two phones converge.
        if (status === 'SUBSCRIBED') onResync()
      })

      const onVisible = () => {
        if (!document.hidden) onResync()
      }
      document.addEventListener('visibilitychange', onVisible)

      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        void sb.removeChannel(channel)
      }
    },
  } satisfies DataAdapter as DataAdapter
}

export type { ClaimResult }
