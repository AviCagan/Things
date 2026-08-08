import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { QuickAdd } from '@/components/shell/QuickAdd'
import { Icon } from '@/components/primitives/Icon'
import { RECURRENCE_PRESETS } from '@/lib/time'
import { dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { fire } from '@/lib/haptics'
import type { RecurrenceUnit } from '@/data/types'

/** Quick-add plus a recurrence picker that reveals itself only when armed. */
export function ChoreAddBar() {
  const profileId = useProfile((s) => s.profileId)
  const [recurring, setRecurring] = useState(false)
  const [preset, setPreset] = useState(RECURRENCE_PRESETS[0])
  const [custom, setCustom] = useState<{ count: string; unit: RecurrenceUnit }>({
    count: '3',
    unit: 'days',
  })
  const [useCustom, setUseCustom] = useState(false)

  const recurrence = recurring
    ? useCustom
      ? { count: Math.max(1, parseInt(custom.count) || 1), unit: custom.unit }
      : { count: preset.count, unit: preset.unit }
    : null

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {recurring && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mx-3 overflow-hidden"
          >
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-2xl p-2"
              style={{
                background: 'var(--dock-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border)',
              }}
            >
              {RECURRENCE_PRESETS.map((p) => {
                const on = !useCustom && preset.label === p.label
                return (
                  <button
                    key={p.label}
                    onClick={() => {
                      fire('snap')
                      setUseCustom(false)
                      setPreset(p)
                    }}
                    className="rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                    style={{
                      background: on ? 'var(--accent)' : 'var(--surface-2)',
                      color: on ? '#fff' : 'var(--text-dim)',
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}

              <div
                className="flex items-center gap-1 rounded-full px-1.5 py-1"
                style={{
                  background: useCustom ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: useCustom ? '1px solid var(--accent)' : '1px solid transparent',
                }}
              >
                <span className="pl-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                  every
                </span>
                <input
                  value={custom.count}
                  onChange={(e) => {
                    setUseCustom(true)
                    setCustom({ ...custom, count: e.target.value.replace(/\D/g, '') })
                  }}
                  onFocus={() => setUseCustom(true)}
                  inputMode="numeric"
                  className="w-8 bg-transparent text-center text-[12px] outline-none"
                />
                <select
                  value={custom.unit}
                  onChange={(e) => {
                    setUseCustom(true)
                    setCustom({ ...custom, unit: e.target.value as RecurrenceUnit })
                  }}
                  className="bg-transparent text-[12px] outline-none"
                  style={{ color: 'var(--text)' }}
                >
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickAdd
        placeholder={recurring ? 'Recurring chore…' : 'Add a chore…'}
        onSubmit={(title, urgency) =>
          dataActions.addChore(title, urgency, profileId, recurrence)
        }
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
