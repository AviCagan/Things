import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { QuickAdd } from '@/components/shell/QuickAdd'
import { Icon } from '@/components/primitives/Icon'
import { RECURRENCE_PRESETS, describeRecurrence } from '@/lib/time'
import { dataActions, type Recurrence } from '@/store/useData'
import { useProfile, useSettings } from '@/store/useProfile'
import { fire } from '@/lib/haptics'
import type { RecurrenceUnit, Weekday } from '@/data/types'
import { WEEKDAY_LABELS } from '@/data/types'
import { toast } from 'sonner'

type Mode = 'presets' | 'every' | 'days'

const WEEKDAY_ORDER: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/**
 * Quick-add plus a recurrence picker that reveals itself only when armed.
 *
 * Three ways to say "how often", surfaced one at a time behind a mode switch
 * rather than all stacked together — a chip row, a stepper, and a 7-day
 * picker shown simultaneously is exactly the "crowded" this replaced. Only
 * the active mode's control is on screen; the others are one tap away.
 */
export function ChoreAddBar() {
  const profileId = useProfile((s) => s.profileId)
  const settings = useSettings()
  // An empty selection means "show the defaults" rather than "show nothing".
  const chosen = settings?.recurrence_presets ?? []
  const presets = chosen.length
    ? RECURRENCE_PRESETS.filter((p) => chosen.includes(p.label))
    : RECURRENCE_PRESETS

  const [recurring, setRecurring] = useState(false)
  const [mode, setMode] = useState<Mode>('presets')
  const [preset, setPreset] = useState(RECURRENCE_PRESETS[0])
  const [custom, setCustom] = useState<{
    count: string
    unit: Exclude<RecurrenceUnit, 'weekdays'>
  }>({
    count: '3',
    unit: 'days',
  })
  const [days, setDays] = useState<Set<Weekday>>(new Set())

  const recurrence: Recurrence | null = !recurring
    ? null
    : mode === 'days'
      ? days.size
        ? { unit: 'weekdays', days: [...days] }
        : null
      : mode === 'every'
        ? { unit: custom.unit, count: Math.max(1, parseInt(custom.count) || 1) }
        : { unit: preset.unit, count: preset.count }

  const summary =
    mode === 'days'
      ? describeRecurrence(null, 'weekdays', [...days])
      : mode === 'every'
        ? describeRecurrence(Math.max(1, parseInt(custom.count) || 1), custom.unit)
        : describeRecurrence(preset.count, preset.unit)

  function toggleDay(d: Weekday) {
    fire('snap')
    setDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {recurring && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            /* pointer-events-auto: the parent bar is pointer-events-none so
               taps fall through to the list, and this panel must opt back in. */
            className="pointer-events-auto mx-3 overflow-hidden"
          >
            <div
              className="flex flex-col gap-2 rounded-2xl p-2.5"
              style={{
                background: 'var(--dock-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex flex-1 gap-1 rounded-full p-1"
                  style={{ background: 'var(--surface-2)' }}
                >
                  {(
                    [
                      { key: 'presets', label: 'Quick' },
                      { key: 'every', label: 'Every…' },
                      { key: 'days', label: 'Days' },
                    ] as { key: Mode; label: string }[]
                  ).map((m) => {
                    const on = mode === m.key
                    return (
                      <button
                        key={m.key}
                        onClick={() => {
                          fire('snap')
                          setMode(m.key)
                        }}
                        className="flex-1 rounded-full py-1.5 text-[12.5px] font-semibold"
                        style={{
                          background: on ? 'var(--accent)' : 'transparent',
                          color: on ? '#fff' : 'var(--text-dim)',
                        }}
                      >
                        {m.label}
                      </button>
                    )
                  })}
                </div>
                {summary && (
                  <span
                    className="shrink-0 truncate text-[12px]"
                    style={{ color: 'var(--text-faint)', maxWidth: 96 }}
                  >
                    {summary}
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {mode === 'presets' && (
                  <motion.div
                    key="presets"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {presets.map((p) => {
                      const on = preset.label === p.label
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            fire('snap')
                            setPreset(p)
                          }}
                          className="rounded-full px-3 py-2 text-[13px] font-medium"
                          style={{
                            background: on ? 'var(--accent)' : 'var(--surface-2)',
                            color: on ? '#fff' : 'var(--text-dim)',
                          }}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </motion.div>
                )}

                {mode === 'every' && (
                  <motion.div
                    key="every"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="flex items-center gap-1 rounded-full px-2 py-1.5"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <span className="pl-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
                      every
                    </span>
                    <input
                      value={custom.count}
                      onChange={(e) =>
                        setCustom({ ...custom, count: e.target.value.replace(/\D/g, '') })
                      }
                      inputMode="numeric"
                      className="w-9 bg-transparent text-center text-[13px] outline-none"
                    />
                    <select
                      value={custom.unit}
                      onChange={(e) =>
                        setCustom({
                          ...custom,
                          unit: e.target.value as Exclude<RecurrenceUnit, 'weekdays'>,
                        })
                      }
                      className="bg-transparent text-[13px] outline-none"
                      style={{ color: 'var(--text)' }}
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                      <option value="years">years</option>
                    </select>
                  </motion.div>
                )}

                {mode === 'days' && (
                  <motion.div
                    key="days"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      {WEEKDAY_ORDER.map((d) => {
                        const on = days.has(d)
                        return (
                          <button
                            key={d}
                            onClick={() => toggleDay(d)}
                            aria-label={WEEKDAY_LABELS[d].short}
                            aria-pressed={on}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                            style={{
                              background: on ? 'var(--accent)' : 'var(--surface-2)',
                              color: on ? '#fff' : 'var(--text-dim)',
                            }}
                          >
                            {WEEKDAY_LABELS[d].letter}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { label: 'Weekdays', set: [1, 2, 3, 4, 5] },
                          { label: 'Weekends', set: [0, 6] },
                          { label: 'Every day', set: [0, 1, 2, 3, 4, 5, 6] },
                        ] as { label: string; set: Weekday[] }[]
                      ).map((shortcut) => (
                        <button
                          key={shortcut.label}
                          onClick={() => {
                            fire('snap')
                            setDays(new Set(shortcut.set))
                          }}
                          className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}
                        >
                          {shortcut.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickAdd
        placeholder={
          recurring && mode === 'days' && days.size === 0
            ? 'Pick a day first…'
            : recurring
              ? 'Recurring chore…'
              : 'Add a chore…'
        }
        onSubmit={(title, urgency) => {
          // Without this, submitting with the "Days" tab open but nothing
          // picked would silently add a one-off chore — the toggle reads as
          // on, but recurrence quietly resolves to null.
          if (recurring && mode === 'days' && days.size === 0) {
            fire('warning')
            toast.warning('Pick at least one day first')
            return
          }
          void dataActions.addChore(title, urgency, profileId, recurrence)
        }}
        leading={
          <button
            onClick={() => {
              fire(recurring ? 'toggleOff' : 'toggleOn')
              setRecurring((r) => !r)
            }}
            aria-label={recurring ? 'Recurring on' : 'Make recurring'}
            aria-pressed={recurring}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              background: recurring ? 'var(--accent)' : 'transparent',
              color: recurring ? '#fff' : 'var(--text-faint)',
              border: `1.5px solid ${recurring ? 'var(--accent)' : 'var(--border-strong)'}`,
            }}
          >
            <Icon name="repeat" size={15} strokeWidth={2.4} />
          </button>
        }
      />
    </div>
  )
}
