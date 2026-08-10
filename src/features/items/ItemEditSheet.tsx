import { useEffect, useState } from 'react'
import { Sheet } from '@/components/primitives/Sheet'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions, type Recurrence } from '@/store/useData'
import { useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'
import { RECURRENCE_PRESETS, deriveRecurrenceUI, describeRecurrence } from '@/lib/time'
import { RecurrenceFields, type RecurrenceMode } from '@/features/chores/RecurrenceFields'
import { toast } from 'sonner'
import {
  URGENCY_LEVELS,
  URGENCY_META,
  type RecurrenceUnit,
  type Urgency,
  type Weekday,
} from '@/data/types'

const URGENCY_COLORS: Record<Urgency, string> = {
  0: 'var(--u-low)',
  1: 'var(--u-med)',
  2: 'var(--u-urgent)',
}

/**
 * Everything about one item, in one place.
 *
 * Long-pressing a row used to open a radial wheel for urgency alone. That
 * gesture now opens this instead — title, notes, urgency, and (for chores)
 * the full recurrence picker, plus delete. Editing was previously
 * create-only: once a chore's recurrence was set there was no way to change
 * it short of deleting and re-adding.
 *
 * Stays mounted permanently, like every other sheet in the app — Sheet's own
 * `open` prop drives its AnimatePresence, so an early `return null` here
 * would skip the close animation instead of playing it.
 */
export function ItemEditSheet() {
  const sheet = useUI((s) => s.sheet)
  const closeSheet = useUI((s) => s.closeSheet)

  const todos = useData((s) => s.todos)
  const chores = useData((s) => s.chores)
  const shoppingItems = useData((s) => s.shopping_items)
  const stores = useData((s) => s.stores)

  const item = sheet.kind === 'item' ? sheet : null
  const row = !item
    ? null
    : item.table === 'todos'
      ? todos.find((t) => t.id === item.id)
      : item.table === 'chores'
        ? chores.find((c) => c.id === item.id)
        : shoppingItems.find((i) => i.id === item.id)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [urgency, setUrgency] = useState<Urgency>(1)
  const [quantity, setQuantity] = useState('')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [recurring, setRecurring] = useState(false)
  const [mode, setMode] = useState<RecurrenceMode>('presets')
  const [preset, setPreset] = useState(RECURRENCE_PRESETS[0])
  const [custom, setCustom] = useState<{
    count: string
    unit: Exclude<RecurrenceUnit, 'weekdays'>
  }>({ count: '3', unit: 'days' })
  const [days, setDays] = useState<Set<Weekday>>(new Set())

  // Re-seed every field whenever a *different* item's sheet opens — not on
  // every store update, or a realtime echo of your own edit would stomp on
  // what you're still typing.
  useEffect(() => {
    if (!row) return
    setTitle(row.title)
    setUrgency(row.urgency)
    setConfirmDelete(false)

    if ('notes' in row) setNotes(row.notes ?? '')
    if ('quantity' in row) setQuantity(row.quantity ?? '')
    if ('store_id' in row) setStoreId(row.store_id)

    if ('is_recurring' in row) {
      setRecurring(row.is_recurring)
      const ui = deriveRecurrenceUI(row)
      setMode(ui.mode)
      setPreset(ui.preset)
      setCustom(ui.custom)
      setDays(ui.days)
    }
    // Deliberately keyed on the id, not the row object — the row's identity
    // changes on every realtime update, which would re-seed mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const table = item?.table ?? 'todos'
  const isChore = table === 'chores'
  const isShopping = table === 'shopping_items'

  const recurrence: Recurrence | null = !recurring
    ? null
    : mode === 'days'
      ? days.size
        ? { unit: 'weekdays', days: [...days] }
        : null
      : mode === 'every'
        ? { unit: custom.unit, count: Math.max(1, parseInt(custom.count) || 1) }
        : { unit: preset.unit, count: preset.count }

  const recurrenceSummary =
    mode === 'days'
      ? describeRecurrence(null, 'weekdays', [...days])
      : mode === 'every'
        ? describeRecurrence(Math.max(1, parseInt(custom.count) || 1), custom.unit)
        : describeRecurrence(preset.count, preset.unit)

  function save() {
    if (!item) return
    const trimmed = title.trim()
    if (!trimmed) {
      fire('warning')
      toast.warning('Give it a title first')
      return
    }
    if (isChore && recurring && mode === 'days' && days.size === 0) {
      fire('warning')
      toast.warning('Pick at least one day, or turn recurring off')
      return
    }

    if (item.table === 'todos') {
      void dataActions.patchRow('todos', item.id, {
        title: trimmed,
        urgency,
        notes: notes.trim() || null,
      })
    } else if (item.table === 'chores') {
      void dataActions.patchRow('chores', item.id, {
        title: trimmed,
        urgency,
        notes: notes.trim() || null,
        is_recurring: recurrence !== null,
        recurrence_count: recurrence && recurrence.unit !== 'weekdays' ? recurrence.count : null,
        recurrence_unit: recurrence?.unit ?? null,
        recurrence_days: recurrence && recurrence.unit === 'weekdays' ? recurrence.days : null,
      })
    } else {
      void dataActions.patchRow('shopping_items', item.id, {
        title: trimmed,
        urgency,
        quantity: quantity.trim() || null,
        store_id: storeId,
      })
    }

    fire('success')
    closeSheet()
  }

  function remove() {
    if (!item) return
    void dataActions.remove(item.table, item.id)
    fire('delete')
    closeSheet()
  }

  return (
    <Sheet open={item !== null} onClose={closeSheet} title="Edit">
      {!row ? (
        // The row can vanish out from under the sheet — deleted from the
        // other phone while this one still has it open — or this renders
        // briefly while the sheet is closed and item is null.
        <p className="py-8 text-center text-[14px]" style={{ color: 'var(--text-faint)' }}>
          {item ? 'This was deleted.' : ''}
        </p>
      ) : (
        <div className="flex flex-col gap-5 pb-4">
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl px-3.5 py-3 text-[15px] outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
              Urgency
            </label>
            <div className="flex gap-2">
              {URGENCY_LEVELS.map((u) => {
                const on = urgency === u
                return (
                  <button
                    key={u}
                    onClick={() => {
                      fire('snap')
                      setUrgency(u)
                    }}
                    className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold"
                    style={{
                      background: on
                        ? `color-mix(in oklab, ${URGENCY_COLORS[u]} 22%, transparent)`
                        : 'var(--surface-2)',
                      border: `1.5px solid ${on ? URGENCY_COLORS[u] : 'var(--border)'}`,
                      color: on ? URGENCY_COLORS[u] : 'var(--text-dim)',
                    }}
                  >
                    {URGENCY_META[u].label}
                  </button>
                )
              })}
            </div>
          </div>

          {isShopping && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Quantity
              </label>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Optional — e.g. 2 lbs"
                className="rounded-xl px-3.5 py-3 text-[15px] outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              />
            </div>
          )}

          {isShopping && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Store
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    fire('snap')
                    setStoreId(null)
                  }}
                  className="rounded-full px-3 py-2 text-[13px] font-medium"
                  style={{
                    background: storeId === null ? 'var(--accent)' : 'var(--surface-2)',
                    color: storeId === null ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  No store
                </button>
                {stores.map((s) => {
                  const on = storeId === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        fire('snap')
                        setStoreId(s.id)
                      }}
                      className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium"
                      style={{
                        background: on ? 'var(--accent)' : 'var(--surface-2)',
                        color: on ? '#fff' : 'var(--text-dim)',
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: s.color_hex }}
                      />
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {(table === 'todos' || isChore) && (
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                rows={3}
                className="resize-none rounded-xl px-3.5 py-3 text-[14px] outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              />
            </div>
          )}

          {isChore && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                  Repeats
                </label>
                <button
                  role="switch"
                  aria-checked={recurring}
                  onClick={() => {
                    fire(recurring ? 'toggleOff' : 'toggleOn')
                    setRecurring((r) => !r)
                  }}
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ background: recurring ? 'var(--accent)' : 'var(--surface-3)' }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                    style={{ left: 2, transform: `translateX(${recurring ? 20 : 0}px)` }}
                  />
                </button>
              </div>

              {recurring && (
                <div className="rounded-2xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                  <RecurrenceFields
                    mode={mode}
                    setMode={setMode}
                    presets={RECURRENCE_PRESETS}
                    preset={preset}
                    setPreset={setPreset}
                    custom={custom}
                    setCustom={setCustom}
                    days={days}
                    setDays={setDays}
                    summary={recurrenceSummary}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {confirmDelete ? (
              <>
                <button
                  onClick={remove}
                  className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white"
                  style={{ background: 'var(--danger)' }}
                >
                  Delete for good
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl px-4 py-3 text-[14px]"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Keep
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={save}
                  className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    fire('tap')
                    setConfirmDelete(true)
                  }}
                  aria-label="Delete"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
                >
                  <Icon name="trash" size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
