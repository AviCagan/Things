import type { Chore, RecurrenceUnit } from '@/data/types'

/**
 * Cooldown state is *derived on the client*, never pushed.
 *
 * When a cooldown expires no database row changes, so Postgres emits no
 * realtime event — there is nothing to subscribe to. `next_due_at` is stored
 * only so the DB can index and sort by it; the decision below is what actually
 * moves a chore between the active list and the resting drawer.
 */
export function isResting(chore: Chore, now: number): boolean {
  if (!chore.is_recurring || !chore.next_due_at) return false
  return new Date(chore.next_due_at).getTime() > now
}

/** 0 → just completed, 1 → ready again. Drives the progress ring. */
export function cooldownProgress(chore: Chore, now: number): number {
  if (!chore.last_completed_at || !chore.next_due_at) return 1
  const start = new Date(chore.last_completed_at).getTime()
  const end = new Date(chore.next_due_at).getTime()
  if (end <= start) return 1
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Compact relative duration: "4h 20m", "3d", "in a moment". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'now'
  if (ms < MIN) return 'under a minute'
  if (ms < HOUR) return `${Math.round(ms / MIN)}m`
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR)
    const m = Math.round((ms % HOUR) / MIN)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(ms / DAY)
  const h = Math.round((ms % DAY) / HOUR)
  return h > 0 && d < 3 ? `${d}d ${h}h` : `${d}d`
}

export function readyIn(chore: Chore, now: number): string {
  if (!chore.next_due_at) return ''
  return formatDuration(new Date(chore.next_due_at).getTime() - now)
}

export const RECURRENCE_PRESETS: {
  label: string
  count: number
  unit: RecurrenceUnit
}[] = [
  { label: 'Daily', count: 1, unit: 'days' },
  { label: 'Every 2 days', count: 2, unit: 'days' },
  { label: 'Weekly', count: 1, unit: 'weeks' },
  { label: 'Every 2 weeks', count: 2, unit: 'weeks' },
  { label: 'Monthly', count: 1, unit: 'months' },
]

export function describeRecurrence(
  count: number | null,
  unit: RecurrenceUnit | null,
): string {
  if (!count || !unit) return ''
  const preset = RECURRENCE_PRESETS.find((p) => p.count === count && p.unit === unit)
  if (preset) return preset.label
  const singular = unit.slice(0, -1)
  return count === 1 ? `Every ${singular}` : `Every ${count} ${unit}`
}
