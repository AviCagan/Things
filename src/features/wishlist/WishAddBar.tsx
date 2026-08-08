import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from '@/components/primitives/Icon'
import { dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { fire } from '@/lib/haptics'
import { parsePrice } from '@/lib/money'
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
  const [price, setPrice] = useState('')
  const [showPrice, setShowPrice] = useState(false)
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
      {
        ...(isUrl ? { url: title } : {}),
        ...(price.trim() ? { price_cents: parsePrice(price) } : {}),
      },
    )
    setValue('')
    setPrice('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {showPrice && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.2 }}
            /* The parent bar is pointer-events-none so taps fall through to
               the grid; this panel has to opt back in. */
            className="pointer-events-auto mx-3 overflow-hidden"
          >
            <div
              className="flex items-center gap-2 rounded-2xl p-2"
              style={{
                background: 'var(--dock-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                className="pl-2 text-[15px] font-semibold"
                style={{ color: 'var(--text-faint)' }}
              >
                $
              </span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                  }
                }}
                placeholder="How much?"
                inputMode="decimal"
                enterKeyHint="done"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--text-faint)]"
              />
              {price.trim() && parsePrice(price) === null && (
                <span className="pr-2 text-[12px]" style={{ color: 'var(--warn)' }}>
                  not a number
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <WishBar
        value={value}
        setValue={setValue}
        desire={desire}
        setDesire={setDesire}
        focused={focused}
        setFocused={setFocused}
        inputRef={inputRef}
        commit={commit}
        showPrice={showPrice}
        togglePrice={() => {
          fire(showPrice ? 'toggleOff' : 'toggleOn')
          setShowPrice((p) => !p)
        }}
        hasPrice={price.trim().length > 0}
      />
    </div>
  )
}

function WishBar({
  value,
  setValue,
  desire,
  setDesire,
  focused,
  setFocused,
  inputRef,
  commit,
  showPrice,
  togglePrice,
  hasPrice,
}: {
  value: string
  setValue: (v: string) => void
  desire: Desire
  setDesire: (d: Desire) => void
  focused: boolean
  setFocused: (f: boolean) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  commit: () => void
  showPrice: boolean
  togglePrice: () => void
  hasPrice: boolean
}) {
  const on = showPrice || hasPrice

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
        type="button"
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

      <button
        onClick={togglePrice}
        type="button"
        aria-label={showPrice ? 'Hide price' : 'Add a price'}
        aria-pressed={on}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] font-bold"
        style={{
          background: on ? 'var(--accent)' : 'transparent',
          color: on ? '#fff' : 'var(--text-faint)',
          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
        }}
      >
        $
      </button>

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
