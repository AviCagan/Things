// Pure event classification — no Deno, no network, no secrets.
//
// Split out of index.ts specifically so it can be unit tested from the app's
// own suite. The urgency threshold here regressed silently once before: when
// urgency was cut from a four-level scale (0-3) to three levels (0-2), this
// file's `>= 3` check was left behind. It could never be true again, so
// `urgent_added` stopped firing — masked because `any_added` still covered
// every insert, so nothing looked broken in casual testing.

export type NotifyEvent = 'claim_complete' | 'cooldown_ready' | 'urgent_added' | 'any_added'

export interface Push {
  title: string
  body: string
  tab?: string
  itemId?: string
  tag?: string
}

export const TAB_FOR: Record<string, string> = {
  todos: 'todos',
  chores: 'chores',
  shopping_items: 'shopping',
  wishlist_items: 'wishlist',
}

const NOUN: Record<string, string> = {
  todos: 'to-do',
  chores: 'chore',
  shopping_items: 'shopping item',
  wishlist_items: 'wish',
}

export interface Row {
  id: string
  title: string
  urgency?: number
  claimed_by?: string | null
  created_by?: string | null
  is_done?: boolean
  last_completed_by?: string | null
}

export interface WebhookBody {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Row | null
  old_record: Row | null
}

export interface Classified {
  event: NotifyEvent
  actorId: string | null
  targetId: string | null
  push: Push
}

/**
 * The top urgency level. Must track `URGENCY.URGENT` in `src/data/types.ts` —
 * there is no automated link between the two, which is exactly how this broke
 * last time.
 */
export const URGENT_LEVEL = 2

/**
 * Decide what (if anything) this change should announce, and to whom.
 *
 * `any_added` fully subsumes `urgent_added`, so an insert resolves to exactly
 * one event and the recipient never gets two notifications for one action.
 */
export function classify(body: WebhookBody): Classified | null {
  const { type, table, record, old_record } = body
  if (!record) return null

  const tab = TAB_FOR[table]
  const noun = NOUN[table] ?? 'item'

  if (type === 'INSERT') {
    const urgent = (record.urgency ?? 0) >= URGENT_LEVEL
    return {
      event: urgent ? 'urgent_added' : 'any_added',
      actorId: record.created_by ?? null,
      targetId: null, // the other person, resolved later
      push: {
        title: urgent ? `Urgent ${noun}` : `New ${noun}`,
        body: record.title,
        tab,
        itemId: record.id,
        tag: `add-${record.id}`,
      },
    }
  }

  if (type === 'UPDATE' && old_record) {
    // Newly claimed
    if (!old_record.claimed_by && record.claimed_by) {
      return {
        event: 'claim_complete',
        actorId: record.claimed_by,
        targetId: record.created_by ?? null,
        push: {
          title: 'Claimed',
          body: record.title,
          tab,
          itemId: record.id,
          tag: `claim-${record.id}`,
        },
      }
    }
    // Newly completed (one-off)
    if (!old_record.is_done && record.is_done) {
      return {
        event: 'claim_complete',
        actorId: null,
        targetId: record.created_by ?? null,
        push: {
          title: 'Done',
          body: record.title,
          tab,
          itemId: record.id,
          tag: `done-${record.id}`,
        },
      }
    }
    // Recurring chore completed — starts a cooldown rather than finishing.
    if (
      table === 'chores' &&
      record.last_completed_by &&
      old_record.last_completed_by !== record.last_completed_by
    ) {
      return {
        event: 'claim_complete',
        actorId: record.last_completed_by,
        targetId: null,
        push: {
          title: 'Chore done',
          body: `${record.title} — resting now`,
          tab: 'chores',
          itemId: record.id,
          tag: `chore-${record.id}`,
        },
      }
    }
  }

  return null
}
