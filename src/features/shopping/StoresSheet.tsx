import { useState } from 'react'
import { Sheet } from '@/components/primitives/Sheet'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'
import type { Store } from '@/data/types'

const PALETTE = [
  '#4a9d7e',
  '#7c5cff',
  '#ff6ea9',
  '#f5a524',
  '#3aa0ff',
  '#e0563c',
  '#9b8cff',
  '#2bb673',
]

export function StoresSheet() {
  const sheet = useUI((s) => s.sheet)
  const closeSheet = useUI((s) => s.closeSheet)
  const stores = useData((s) => s.stores)

  const [name, setName] = useState('')
  const [isOnline, setIsOnline] = useState(false)
  const [address, setAddress] = useState('')
  const [color, setColor] = useState(PALETTE[0])

  async function add() {
    if (!name.trim()) return
    await dataActions.addStore({
      name: name.trim(),
      is_online: isOnline,
      url: null,
      // A DB constraint also forbids coordinates on online stores, so an
      // online shop can never leak into a driving route.
      address: isOnline ? null : address.trim() || null,
      lat: null,
      lng: null,
      geocoded_at: null,
      geocode_source: null,
      color_hex: color,
      emoji: null,
    })
    setName('')
    setAddress('')
    setIsOnline(false)
    setColor(PALETTE[(PALETTE.indexOf(color) + 1) % PALETTE.length])
  }

  return (
    <Sheet open={sheet.kind === 'stores'} onClose={closeSheet} title="Stores">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5 rounded-2xl p-3.5" style={{ background: 'var(--surface-2)' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Store name"
            className="rounded-xl px-3.5 py-3 outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          />

          <label className="flex items-center gap-2.5 px-1 py-1">
            <button
              onClick={() => {
                fire(isOnline ? 'toggleOff' : 'toggleOn')
                setIsOnline((v) => !v)
              }}
              role="switch"
              aria-checked={isOnline}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: isOnline ? 'var(--accent)' : 'var(--surface-3)' }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
                style={{ left: 2, transform: `translateX(${isOnline ? 20 : 0}px)` }}
              />
            </button>
            <span className="text-[14px]">Online only</span>
            <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
              excluded from trips
            </span>
          </label>

          {!isOnline && (
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address (optional — used for trip planning)"
              className="rounded-xl px-3.5 py-3 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            />
          )}

          <div className="flex items-center gap-2 px-1 pt-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  fire('snap')
                  setColor(c)
                }}
                aria-label={`Colour ${c}`}
                className="h-6 w-6 rounded-full"
                style={{
                  background: c,
                  outline: color === c ? '2px solid var(--text)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>

          <button
            onClick={add}
            disabled={!name.trim()}
            className="mt-1 rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            Add store
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {stores.map((store) => (
            <StoreRow key={store.id} store={store} />
          ))}
          {stores.length === 0 && (
            <p className="px-1 py-4 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>
              No stores yet. Add one above to start grouping your shopping list.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function StoreRow({ store }: { store: Store }) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(store.address ?? '')

  async function saveAddress() {
    await dataActions.patchRow('stores', store.id, {
      address: address.trim() || null,
      // Clear the cached geocode so the new address is resolved next trip.
      lat: null,
      lng: null,
      geocoded_at: null,
      geocode_source: null,
    })
    setEditing(false)
    fire('success')
  }

  return (
    <div
      className="flex flex-col gap-2.5 rounded-2xl p-3.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: store.color_hex }} />
        <span className="flex-1 text-[15px] font-medium">{store.name}</span>
        {store.is_online ? (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
          >
            <Icon name="globe" size={11} strokeWidth={2.4} />
            Online
          </span>
        ) : (
          <button
            onClick={() => setEditing((e) => !e)}
            className="rounded-full px-2 py-1 text-[11px]"
            style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
          >
            {store.address ? 'Edit address' : 'Add address'}
          </button>
        )}
        <button
          onClick={() => void dataActions.remove('stores', store.id)}
          aria-label={`Delete ${store.name}`}
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{ color: 'var(--text-faint)' }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {!store.is_online && store.address && !editing && (
        <p className="pl-6 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          {store.address}
        </p>
      )}

      {editing && (
        <div className="flex gap-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city"
            className="flex-1 rounded-xl px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          />
          <button
            onClick={saveAddress}
            className="rounded-xl px-3 text-[13px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}
