import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Screen, Section, EmptyState } from '@/components/shell/Screen'
import { ListRow } from '@/components/primitives/ListRow'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'
import { StoresSheet } from './StoresSheet'
import { TripSheet } from './TripSheet'
import type { ShoppingItem, Store, Urgency } from '@/data/types'

const UNSORTED = '__unsorted__'

export function ShoppingTab() {
  const items = useData((s) => s.shopping_items)
  const stores = useData((s) => s.stores)
  const profiles = useData((s) => s.profiles)
  const profileId = useProfile((s) => s.profileId)
  const openSheet = useUI((s) => s.openSheet)

  const groups = useMemo(() => {
    const active = items.filter((i) => !i.is_done)
    const byStore = new Map<string, ShoppingItem[]>()
    for (const item of active) {
      const key = item.store_id ?? UNSORTED
      const list = byStore.get(key) ?? []
      list.push(item)
      byStore.set(key, list)
    }
    for (const list of byStore.values()) {
      list.sort((a, b) =>
        a.urgency !== b.urgency ? b.urgency - a.urgency : b.sort_order - a.sort_order,
      )
    }

    const ordered = [...stores]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((store) => ({ store, items: byStore.get(store.id) ?? [] }))
      .filter((g) => g.items.length > 0)

    return {
      physical: ordered.filter((g) => !g.store.is_online),
      online: ordered.filter((g) => g.store.is_online),
      unsorted: byStore.get(UNSORTED) ?? [],
      done: items.filter((i) => i.is_done),
      activeCount: active.length,
    }
  }, [items, stores])

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? 'Someone'

  const routableCount = groups.physical.length

  return (
    <>
      <Screen
        title="Shopping"
        count={groups.activeCount}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fire('tap')
                openSheet({ kind: 'stores' })
              }}
              aria-label="Manage stores"
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <Icon name="pin" size={16} />
            </button>
            <button
              onClick={() => {
                fire('toggleOn')
                openSheet({ kind: 'trip' })
              }}
              disabled={routableCount === 0}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Icon name="route" size={15} strokeWidth={2.4} />
              Plan trip
            </button>
          </div>
        }
      >
        {groups.activeCount === 0 && groups.done.length === 0 ? (
          <EmptyState
            icon={<Icon name="cart" size={44} strokeWidth={1.5} />}
            title="Nothing to buy"
            hint="Add items below and tag them with a store. Then hit Plan trip and we'll work out the driving order."
          />
        ) : (
          <div className="flex flex-col">
            {groups.physical.map(({ store, items: list }) => (
              <StoreGroup
                key={store.id}
                store={store}
                items={list}
                profiles={profiles}
                profileId={profileId}
                nameOf={nameOf}
              />
            ))}

            {groups.unsorted.length > 0 && (
              <StoreGroup
                store={{
                  id: UNSORTED,
                  name: 'No store yet',
                  color_hex: '#8e8e9c',
                  is_online: false,
                } as Store}
                items={groups.unsorted}
                profiles={profiles}
                profileId={profileId}
                nameOf={nameOf}
              />
            )}

            {/* Online stores sit apart — they're never part of a driving trip. */}
            {groups.online.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 px-2 pb-1">
                  <Icon name="globe" size={14} strokeWidth={2.4} />
                  <span
                    className="text-[13px] font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Online
                  </span>
                </div>
                <p className="px-2 pb-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                  Not included in trip planning.
                </p>
                {groups.online.map(({ store, items: list }) => (
                  <StoreGroup
                    key={store.id}
                    store={store}
                    items={list}
                    profiles={profiles}
                    profileId={profileId}
                    nameOf={nameOf}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <Section label="Bought" count={groups.done.length}>
          {groups.done.map((item) => (
            <ListRow
              key={item.id}
              title={item.title}
              urgency={item.urgency}
              claimedBy={item.claimed_by}
              profiles={profiles}
              done
              trailing={
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void dataActions.remove('shopping_items', item.id)
                  }}
                  aria-label="Delete"
                  className="grid h-8 w-8 place-items-center rounded-full"
                  style={{ color: 'var(--text-faint)' }}
                >
                  <Icon name="trash" size={16} />
                </button>
              }
              onComplete={() => dataActions.toggleShoppingItem(item)}
              onClaim={() => {}}
              onUrgency={(u: Urgency) => dataActions.setUrgency('shopping_items', item.id, u)}
            />
          ))}
        </Section>
      </Screen>

      <StoresSheet />
      <TripSheet />
    </>
  )
}

function StoreGroup({
  store,
  items,
  profiles,
  profileId,
  nameOf,
}: {
  store: Store
  items: ShoppingItem[]
  profiles: import('@/data/types').Profile[]
  profileId: string | null
  nameOf: (id: string) => string
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="mt-3">
      <button
        onClick={() => {
          fire('tap')
          setOpen((o) => !o)
        }}
        className="flex w-full items-center gap-2 px-2 py-1.5"
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <Icon name="chevron" size={14} strokeWidth={2.6} />
        </motion.span>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: store.color_hex }}
        />
        <span className="text-[14px] font-semibold">{store.name}</span>
        {store.is_online && <Icon name="globe" size={12} strokeWidth={2.4} />}
        <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
          {items.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              {items.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.title}
                  urgency={item.urgency}
                  claimedBy={item.claimed_by}
                  profiles={profiles}
                  meta={item.quantity ? <span>{item.quantity}</span> : undefined}
                  onComplete={() => dataActions.toggleShoppingItem(item)}
                  onClaim={() =>
                    profileId &&
                    dataActions.toggleClaim(
                      'shopping_items',
                      item.id,
                      profileId,
                      item.claimed_by,
                      nameOf,
                    )
                  }
                  onUrgency={(u: Urgency) =>
                    dataActions.setUrgency('shopping_items', item.id, u)
                  }
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
