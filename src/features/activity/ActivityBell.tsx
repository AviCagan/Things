import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/primitives/Sheet'
import { Icon, type IconName } from '@/components/primitives/Icon'
import { useData } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'
import { formatDuration } from '@/lib/time'
import type { ActivityLog } from '@/data/types'

/**
 * A plain-language feed of what changed — independent of push delivery, so it
 * still tells the story even on a device where notifications never arrived
 * (see supabase/011_activity_and_edits.sql). Unread state is per person, per
 * device, in localStorage, same as the tour: two phones are two installs.
 */

const LAST_SEEN_KEY = 'things.activity.lastSeen.v1'

function getLastSeen(profileId: string): string | null {
  try {
    return localStorage.getItem(`${LAST_SEEN_KEY}.${profileId}`)
  } catch {
    return null
  }
}

function setLastSeen(profileId: string, iso: string): void {
  try {
    localStorage.setItem(`${LAST_SEEN_KEY}.${profileId}`, iso)
  } catch {
    /* best-effort — worst case the badge over-counts next launch */
  }
}

export function ActivityBell() {
  const profileId = useProfile((s) => s.profileId)
  const profiles = useData((s) => s.profiles)
  const entries = useData((s) => s.activity_log)
  const sheet = useUI((s) => s.sheet)
  const openSheet = useUI((s) => s.openSheet)
  const closeSheet = useUI((s) => s.closeSheet)
  const open = sheet.kind === 'activity'

  const [lastSeen, setLastSeenState] = useState<string | null>(() =>
    profileId ? getLastSeen(profileId) : null,
  )

  // The local adapter doesn't guarantee insertion order and the Supabase one
  // returns newest-first from the server, but sorting here costs nothing and
  // means the bell never depends on that staying true.
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [entries],
  )

  const unread = useMemo(() => {
    if (!lastSeen) return sorted.length
    return sorted.filter((e) => e.created_at > lastSeen).length
  }, [sorted, lastSeen])

  // Marking as seen on open, not on individual row taps — this is a feed to
  // scan, not a per-item inbox.
  useEffect(() => {
    if (!open || !profileId) return
    const newest = sorted[0]?.created_at
    if (!newest) return
    setLastSeen(profileId, newest)
    setLastSeenState(newest)
  }, [open, profileId, sorted])

  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.display_name ?? 'Someone'

  return (
    <>
      <button
        onClick={() => {
          fire('tap')
          openSheet({ kind: 'activity' })
        }}
        aria-label={unread > 0 ? `Activity — ${unread} unread` : 'Activity'}
        className="relative grid h-9 w-9 place-items-center rounded-full"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
        }}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: 'var(--danger)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={closeSheet} title="Activity">
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>
            Nothing yet
          </p>
        ) : (
          <div className="flex flex-col pb-4">
            {sorted.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} actorName={nameOf(entry.actor_id)} />
            ))}
          </div>
        )}
      </Sheet>
    </>
  )
}

const EVENT_META: Record<ActivityLog['event'], { icon: IconName; verb: string; color: string }> = {
  added: { icon: 'plus', verb: 'added', color: 'var(--ok)' },
  edited: { icon: 'pencil', verb: 'edited', color: 'var(--text-dim)' },
  completed: { icon: 'check', verb: 'completed', color: 'var(--ok)' },
  uncompleted: { icon: 'clock', verb: 'un-completed', color: 'var(--warn)' },
  claimed: { icon: 'pin', verb: 'claimed', color: 'var(--accent)' },
  unclaimed: { icon: 'close', verb: 'unclaimed', color: 'var(--text-faint)' },
  deleted: { icon: 'trash', verb: 'deleted', color: 'var(--danger)' },
}

const TABLE_LABEL: Record<ActivityLog['table_name'], string> = {
  todos: 'To-do',
  chores: 'Chore',
  shopping_items: 'Shopping',
  wishlist_items: 'Wishlist',
}

function ActivityRow({ entry, actorName }: { entry: ActivityLog; actorName: string }) {
  const meta = EVENT_META[entry.event]
  const ms = Date.now() - new Date(entry.created_at).getTime()
  const ago = ms < 60_000 ? 'just now' : `${formatDuration(ms)} ago`

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{
          background: `color-mix(in oklab, ${meta.color} 20%, transparent)`,
          color: meta.color,
        }}
      >
        <Icon name={meta.icon} size={15} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-snug">
          <span className="font-semibold">{actorName}</span> {meta.verb}{' '}
          <span className="font-medium">"{entry.title}"</span>
        </div>
        <div
          className="mt-0.5 flex items-center gap-1.5 text-[12px]"
          style={{ color: 'var(--text-faint)' }}
        >
          <span>{TABLE_LABEL[entry.table_name]}</span>
          <span>·</span>
          <span>{ago}</span>
        </div>
      </div>
    </div>
  )
}
