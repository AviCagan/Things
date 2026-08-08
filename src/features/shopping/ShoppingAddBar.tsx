import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { QuickAdd } from '@/components/shell/QuickAdd'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import { useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'

/** Quick-add carrying a store chip, so items land in the right group as typed. */
export function ShoppingAddBar() {
  const stores = useData((s) => s.stores)
  const profileId = useProfile((s) => s.profileId)
  const openSheet = useUI((s) => s.openSheet)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const store = stores.find((s) => s.id === storeId) ?? null

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.2 }}
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
              <button
                onClick={() => {
                  fire('snap')
                  setStoreId(null)
                  setPicking(false)
                }}
                className="rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  background: storeId === null ? 'var(--accent)' : 'var(--surface-2)',
                  color: storeId === null ? '#fff' : 'var(--text-dim)',
                }}
              >
                No store
              </button>

              {stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    fire('snap')
                    setStoreId(s.id)
                    setPicking(false)
                  }}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                  style={{
                    background: storeId === s.id ? s.color_hex : 'var(--surface-2)',
                    color: storeId === s.id ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: storeId === s.id ? '#fff' : s.color_hex }}
                  />
                  {s.name}
                  {s.is_online && <Icon name="globe" size={10} strokeWidth={2.6} />}
                </button>
              ))}

              <button
                onClick={() => {
                  fire('tap')
                  setPicking(false)
                  openSheet({ kind: 'stores' })
                }}
                className="rounded-full px-2.5 py-1.5 text-[12px] font-medium"
                style={{ background: 'var(--surface-2)', color: 'var(--accent-text)' }}
              >
                + New store
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickAdd
        placeholder={store ? `Add to ${store.name}…` : 'Add an item…'}
        onSubmit={(title, urgency) =>
          dataActions.addShoppingItem(title, urgency, storeId, profileId)
        }
        leading={
          <button
            onClick={() => {
              fire('tap')
              setPicking((p) => !p)
            }}
            aria-label="Choose store"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{
              background: store ? store.color_hex : 'transparent',
              color: store ? '#fff' : 'var(--text-faint)',
              border: `1.5px solid ${store ? store.color_hex : 'var(--border-strong)'}`,
            }}
          >
            <Icon name="cart" size={14} strokeWidth={2.4} />
          </button>
        }
      />
    </div>
  )
}
