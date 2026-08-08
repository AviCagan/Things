import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Icon } from '@/components/primitives/Icon'
import { dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { fire } from '@/lib/haptics'
import { DESIRE_META, type Desire } from '@/data/types'

const DESIRE_COLOR: Record<Desire, string> = {
  1: '#64748b',
  2: '#3aa0ff',
  3: 'var(--accent)',
  4: '#f5a524',
  5: '#ff4d4d',
}

/**
 * Wishlist add bar. Uses the want-meter rather than the urgency dot, matching
 * the tab's own visual language.
 */
export function WishAddBar() {
  const profileId = useProfile((s) => s.profileId)
  const [value, setValue] = useState('')
  const [desire, setDesire] = useState<Desire>(3)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const title = value.trim()
    if (!title) return

    // Paste a URL and it's stored as a link rather than a title.
    const isUrl = /^https?:\/\//i.test(title)
    void dataActions.addWish(
      isUrl ? title.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] : title,
      desire,
      profileId,
      isUrl ? { url: title } : {},
    )
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <div
      className="pointer-events-auto mx-3 flex items-center gap-2 rounded-full px-2 py-2"
      style={{
        background: 'var(--dock-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `1px solid ${focused ? 'var(--accent-muted)' : 'var(--border)'}`,
        boxShadow: 'var(--shadow-dock)',
      }}
    >
      <button
        onClick={() => {
          setDesire((((desire % 5) + 1) as Desire))
          fire('snap')
        }}
        aria-label={`Want level: ${DESIRE_META[desire].label}. Tap to change.`}
        className="flex h-8 shrink-0 items-end gap-[3px] rounded-full px-2.5 py-2"
        style={{ background: 'var(--surface-2)' }}
      >
        {([1, 2, 3, 4, 5] as Desire[]).map((n) => (
          <motion.span
            key={n}
            animate={{ height: 4 + n * 2 }}
            className="w-[3px] rounded-full"
            style={{
              background: n <= desire ? DESIRE_COLOR[desire] : 'var(--surface-3)',
            }}
          />
        ))}
      </button>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
        placeholder="Something you want…"
        enterKeyHint="done"
        className="min-w-0 flex-1 bg-transparent px-1 outline-none placeholder:text-[var(--text-faint)]"
      />

      <motion.button
        onClick={commit}
        aria-label="Add"
        animate={{ scale: value.trim() ? 1 : 0.86, opacity: value.trim() ? 1 : 0.45 }}
        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
        style={{ background: 'var(--accent)' }}
      >
        <Icon name="plus" size={19} strokeWidth={2.6} />
      </motion.button>
    </div>
  )
}
