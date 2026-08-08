import { create } from 'zustand'
import type { TabKey } from '@/data/types'

export const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'todos', label: 'To-do', icon: 'check' },
  { key: 'chores', label: 'Chores', icon: 'repeat' },
  { key: 'shopping', label: 'Shopping', icon: 'cart' },
  { key: 'wishlist', label: 'Wishlist', icon: 'star' },
]

type Sheet =
  | { kind: 'none' }
  | { kind: 'settings' }
  | { kind: 'trip' }
  | { kind: 'stores' }
  | { kind: 'item'; table: 'todos' | 'chores' | 'shopping_items'; id: string }
  | { kind: 'wish'; id: string }

export type WishSort = 'desire' | 'price' | 'added'
/** null = everyone; 'shared' = the ones marked as for both of you. */
export type WishOwner = string | 'shared' | null

interface UIState {
  tab: TabKey
  sheet: Sheet
  highlightId: string | null
  // Wishlist view state lives here so it survives switching tabs.
  wishSort: WishSort
  wishDesc: boolean
  wishOwner: WishOwner
  setTab: (tab: TabKey) => void
  openSheet: (sheet: Sheet) => void
  closeSheet: () => void
  highlight: (id: string | null) => void
  setWishSort: (sort: WishSort) => void
  toggleWishDir: () => void
  setWishOwner: (owner: WishOwner) => void
}

export const useUI = create<UIState>((set) => ({
  tab: 'todos',
  sheet: { kind: 'none' },
  highlightId: null,
  wishSort: 'desire',
  wishDesc: true,
  wishOwner: null,
  setTab: (tab) => set({ tab }),
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: { kind: 'none' } }),
  highlight: (id) => set({ highlightId: id }),
  setWishSort: (wishSort) => set({ wishSort }),
  toggleWishDir: () => set((s) => ({ wishDesc: !s.wishDesc })),
  setWishOwner: (wishOwner) => set({ wishOwner }),
}))

export const tabIndex = (tab: TabKey): number =>
  TABS.findIndex((t) => t.key === tab)
