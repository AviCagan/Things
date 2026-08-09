import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Screen, Section, EmptyState } from '@/components/shell/Screen'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useUI, type WishSort } from '@/store/useUI'
import { Avatar } from '@/components/primitives/ClaimChip'
import { fire } from '@/lib/haptics'
import { formatPrice, parsePrice, priceToInput, sumPrices } from '@/lib/money'
import { DESIRE_META, type Desire, type WishlistItem, type Profile } from '@/data/types'

/**
 * The wishlist deliberately uses a different visual grammar from the other
 * tabs: cards with a desire gradient rising from the bottom edge, rather than
 * rows with an urgency spine. Fill height reads instantly across a grid, and
 * "how badly do I want this" never gets confused with "how urgent is this".
 */
export function WishlistTab() {
  const wishes = useData((s) => s.wishlist_items)
  const profiles = useData((s) => s.profiles)

  const wishSort = useUI((s) => s.wishSort)
  const wishDesc = useUI((s) => s.wishDesc)
  const wishOwner = useUI((s) => s.wishOwner)

  const { active, purchased } = useMemo(() => {
    const matchesOwner = (w: WishlistItem) => {
      if (wishOwner === null) return true
      if (wishOwner === 'shared') return w.owner_id === null
      return w.owner_id === wishOwner
    }

    const key = (w: WishlistItem) => {
      if (wishSort === 'price') return w.price_cents ?? -1
      if (wishSort === 'added') return w.sort_order
      return w.desire_level
    }

    const sorted = [...wishes].filter(matchesOwner).sort((a, b) => {
      const diff = key(a) - key(b)
      // Ties fall back to newest first, so the order never looks arbitrary.
      if (diff !== 0) return wishDesc ? -diff : diff
      return b.sort_order - a.sort_order
    })

    return {
      active: sorted.filter((w) => !w.is_purchased),
      purchased: sorted.filter((w) => w.is_purchased),
    }
  }, [wishes, wishSort, wishDesc, wishOwner])

  const total = sumPrices(active)
  const priced = active.filter((w) => w.price_cents != null).length

  return (
    <Screen
      title="Wishlist"
      count={active.length}
      subtitle={
        total > 0 ? (
          <span className="text-[13px]" style={{ color: 'var(--text-dim)' }}>
            <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatPrice(total)}
            </span>
            {priced === active.length ? ' total' : ` · ${priced} of ${active.length} priced`}
          </span>
        ) : undefined
      }
    >
      <FilterBar profiles={profiles} />
      {active.length === 0 && purchased.length === 0 ? (
        <EmptyState
          icon={<Icon name="star" size={44} strokeWidth={1.5} />}
          title="Nothing on the list"
          hint="Stuff you want to buy for yourselves — not household needs. Tap the meter to say how badly."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-1">
          <AnimatePresence initial={false}>
            {active.map((wish) => (
              <WishCard key={wish.id} wish={wish} profiles={profiles} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <Section label="Bought" count={purchased.length}>
        <div className="grid grid-cols-2 gap-2.5 px-1">
          {purchased.map((wish) => (
            <WishCard key={wish.id} wish={wish} profiles={profiles} />
          ))}
        </div>
      </Section>
    </Screen>
  )
}

const SORTS: { key: WishSort; label: string; high: string; low: string }[] = [
  { key: 'desire', label: 'Wanted', high: 'most wanted', low: 'least wanted' },
  { key: 'price', label: 'Price', high: 'priciest', low: 'cheapest' },
  { key: 'added', label: 'Added', high: 'newest', low: 'oldest' },
]

/** Sort, direction and whose-wish filter. */
function FilterBar({ profiles }: { profiles: Profile[] }) {
  const sort = useUI((s) => s.wishSort)
  const desc = useUI((s) => s.wishDesc)
  const owner = useUI((s) => s.wishOwner)
  const setSort = useUI((s) => s.setWishSort)
  const toggleDir = useUI((s) => s.toggleWishDir)
  const setOwner = useUI((s) => s.setWishOwner)

  const current = SORTS.find((s) => s.key === sort)!

  return (
    /* One scrolling row rather than wrapping: wrapping pushed the grid down
       and the number of lines changed as filters were used, which made the
       whole page jump. */
    <div
      className="-mx-3 mb-3 flex items-center gap-1.5 overflow-x-auto px-4 pb-1"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {SORTS.map((s) => {
        const on = s.key === sort
        return (
          <button
            key={s.key}
            onClick={() => {
              fire('snap')
              // Tapping the active sort flips direction rather than doing
              // nothing — one control, both jobs.
              if (on) toggleDir()
              else setSort(s.key)
            }}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium"
            style={{
              background: on ? 'var(--accent)' : 'var(--surface-2)',
              color: on ? '#fff' : 'var(--text-dim)',
            }}
          >
            {s.label}
            {on && (
              <motion.span animate={{ rotate: desc ? 0 : 180 }} className="leading-none">
                ↓
              </motion.span>
            )}
          </button>
        )
      })}

      <span
        className="mx-0.5 h-4 w-px shrink-0"
        style={{ background: 'var(--border-strong)' }}
      />

      <OwnerPill active={owner === null} onClick={() => setOwner(null)} label="All" />
      {profiles.map((p) => (
        <OwnerPill
          key={p.id}
          active={owner === p.id}
          onClick={() => setOwner(p.id)}
          color={p.color_hex}
          avatar={<Avatar profile={p} size={16} />}
          label={p.display_name}
        />
      ))}
      <OwnerPill
        active={owner === 'shared'}
        onClick={() => setOwner('shared')}
        label="Both"
      />

      {(sort !== 'desire' || !desc || owner !== null) && (
        <span
          className="shrink-0 whitespace-nowrap pl-1 pr-2 text-[11px]"
          style={{ color: 'var(--text-faint)' }}
        >
          {desc ? current.high : current.low}
        </span>
      )}
    </div>
  )
}

function OwnerPill({
  active,
  onClick,
  label,
  color,
  avatar,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
  avatar?: React.ReactNode
}) {
  return (
    <button
      onClick={() => {
        fire('snap')
        onClick()
      }}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-medium"
      style={{
        background: active
          ? color
            ? `color-mix(in oklab, ${color} 30%, transparent)`
            : 'var(--accent-soft)'
          : 'var(--surface-2)',
        border: `1px solid ${active ? (color ?? 'var(--accent-muted)') : 'transparent'}`,
        color: active ? 'var(--text)' : 'var(--text-dim)',
      }}
    >
      {avatar && (
        <span className="grid h-4 w-4 place-items-center overflow-hidden rounded-full text-[10px]">
          {avatar}
        </span>
      )}
      {label}
    </button>
  )
}

const DESIRE_COLOR: Record<Desire, string> = {
  1: '#64748b',
  2: '#3aa0ff',
  3: 'var(--accent)',
  4: '#f5a524',
  5: '#ff4d4d',
}

/**
 * Price, edited in place. Tap it and it becomes an input — no sheet, no edit
 * mode, matching how urgency and desire are changed everywhere else.
 */
function PriceTag({ wish }: { wish: WishlistItem }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => priceToInput(wish.price_cents))

  function save() {
    setEditing(false)
    const cents = draft.trim() ? parsePrice(draft) : null
    if (cents === wish.price_cents) return
    fire('toggleOn')
    void dataActions.patchRow('wishlist_items', wish.id, { price_cents: cents })
  }

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-1">
        <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>$</span>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setDraft(priceToInput(wish.price_cents))
              setEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          inputMode="decimal"
          placeholder="0.00"
          className="w-16 rounded-md px-1 text-[12px] outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--accent-muted)' }}
        />
      </div>
    )
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        fire('tap')
        setDraft(priceToInput(wish.price_cents))
        setEditing(true)
      }}
      className="mt-0.5 text-[12px]"
      style={{
        color: wish.price_cents == null ? 'var(--text-faint)' : 'var(--text-dim)',
        opacity: wish.price_cents == null ? 0.75 : 1,
      }}
    >
      {wish.price_cents == null ? 'add price' : formatPrice(wish.price_cents)}
    </button>
  )
}

function WishCard({ wish, profiles }: { wish: WishlistItem; profiles: Profile[] }) {
  const [confirming, setConfirming] = useState(false)
  const owner = profiles.find((p) => p.id === wish.owner_id) ?? null
  const color = DESIRE_COLOR[wish.desire_level]
  // Level 1 barely tints, level 5 floods the card.
  const fill = 8 + wish.desire_level * 17

  function bumpDesire() {
    const next = ((wish.desire_level % 5) + 1) as Desire
    fire('snap')
    void dataActions.patchRow('wishlist_items', wish.id, { desire_level: next })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="relative flex flex-col justify-between overflow-hidden rounded-[var(--radius)] p-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: wish.is_purchased ? 0.55 : 1,
        minHeight: wish.image_url ? 180 : 132,
      }}
    >
      {wish.image_url && (
        <>
          <img
            src={wish.image_url}
            alt=""
            loading="lazy"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            // A broken link shouldn't leave a torn-image icon on the card.
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          {/* Scrim so the title stays readable over any photo. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(to top, rgb(0 0 0 / .82) 0%, rgb(0 0 0 / .55) 45%, rgb(0 0 0 / .25) 100%)',
            }}
          />
        </>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: `${fill}%`,
          background: `linear-gradient(to top, color-mix(in oklab, ${color} 42%, transparent), transparent)`,
        }}
      />

      <div className="relative z-10">
        {/* pr-5 keeps long titles clear of the delete button in the corner. */}
        <div
          className="pr-5 text-[14px] font-semibold leading-snug"
          style={{
            textDecoration: wish.is_purchased ? 'line-through' : 'none',
            color: wish.image_url ? '#fff' : undefined,
            textShadow: wish.image_url ? '0 1px 3px rgb(0 0 0 / .6)' : undefined,
          }}
        >
          {wish.title}
        </div>
        <PriceTag wish={wish} />
      </div>

      <div className="relative z-10 flex items-end justify-between gap-2">
        <button
          onClick={bumpDesire}
          aria-label={`Want level: ${DESIRE_META[wish.desire_level].label}. Tap to change.`}
          className="flex flex-col gap-1"
        >
          <span className="flex items-end gap-[3px]">
            {([1, 2, 3, 4, 5] as Desire[]).map((n) => (
              <span
                key={n}
                className="w-[5px] rounded-full"
                style={{
                  height: 5 + n * 2.5,
                  background: n <= wish.desire_level ? color : 'var(--surface-3)',
                }}
              />
            ))}
          </span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>
            {DESIRE_META[wish.desire_level].label}
          </span>
        </button>

        <div className="flex items-center gap-1">
          {owner && (
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-[12px]"
              style={{
                background: `color-mix(in oklab, ${owner.color_hex} 26%, transparent)`,
                border: `1.5px solid ${owner.color_hex}`,
              }}
              title={owner.display_name}
            >
              {owner.avatar_emoji}
            </span>
          )}
          {wish.url && (
            <button
              onClick={() => {
                fire('tap')
                window.open(wish.url!, '_blank', 'noopener,noreferrer')
              }}
              aria-label="Open link"
              className="grid h-6 w-6 place-items-center rounded-full"
              style={{ color: 'var(--text-faint)' }}
            >
              <Icon name="link" size={13} />
            </button>
          )}
          <button
            onClick={() => {
              fire(wish.is_purchased ? 'toggleOff' : 'complete')
              void dataActions.patchRow('wishlist_items', wish.id, {
                is_purchased: !wish.is_purchased,
                purchased_at: wish.is_purchased ? null : new Date().toISOString(),
              })
            }}
            aria-label={wish.is_purchased ? 'Mark not bought' : 'Mark bought'}
            className="grid h-6 w-6 place-items-center rounded-full"
            style={{
              border: `1.5px solid ${wish.is_purchased ? 'var(--ok)' : 'var(--border-strong)'}`,
              background: wish.is_purchased ? 'var(--ok)' : 'transparent',
              color: '#fff',
            }}
          >
            {wish.is_purchased && <Icon name="check" size={11} strokeWidth={3.4} />}
          </button>
        </div>
      </div>

      {confirming ? (
        <div className="absolute inset-0 z-20 grid place-items-center gap-2 p-3" style={{ background: 'var(--surface)' }}>
          <span className="text-[12px]">Delete this?</span>
          <div className="flex gap-2">
            <button
              onClick={() => void dataActions.remove('wishlist_items', wish.id)}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ background: 'var(--danger)' }}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-full px-3 py-1.5 text-[12px]"
              style={{ color: 'var(--text-dim)' }}
            >
              Keep
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete"
          className="absolute right-1.5 top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full opacity-45"
          style={{ color: 'var(--text-faint)' }}
        >
          <Icon name="close" size={12} strokeWidth={2.6} />
        </button>
      )}
    </motion.div>
  )
}
