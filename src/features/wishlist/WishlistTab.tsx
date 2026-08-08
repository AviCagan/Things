import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Screen, Section, EmptyState } from '@/components/shell/Screen'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { fire } from '@/lib/haptics'
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

  const { active, purchased } = useMemo(() => {
    const sorted = [...wishes].sort((a, b) =>
      a.desire_level !== b.desire_level
        ? b.desire_level - a.desire_level
        : b.sort_order - a.sort_order,
    )
    return {
      active: sorted.filter((w) => !w.is_purchased),
      purchased: sorted.filter((w) => w.is_purchased),
    }
  }, [wishes])

  return (
    <Screen title="Wishlist" count={active.length}>
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

const DESIRE_COLOR: Record<Desire, string> = {
  1: '#64748b',
  2: '#3aa0ff',
  3: 'var(--accent)',
  4: '#f5a524',
  5: '#ff4d4d',
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
      className="relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-[var(--radius)] p-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: wish.is_purchased ? 0.55 : 1,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: `${fill}%`,
          background: `linear-gradient(to top, color-mix(in oklab, ${color} 42%, transparent), transparent)`,
        }}
      />

      <div className="relative z-10">
        <div
          className="text-[14px] font-semibold leading-snug"
          style={{ textDecoration: wish.is_purchased ? 'line-through' : 'none' }}
        >
          {wish.title}
        </div>
        {wish.price_cents != null && (
          <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-dim)' }}>
            ${(wish.price_cents / 100).toFixed(2)}
          </div>
        )}
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
