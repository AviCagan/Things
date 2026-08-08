import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Toaster } from 'sonner'
import { TabDock } from './components/shell/TabDock'
import { ProfileSelect } from './components/shell/ProfileSelect'
import { PulseLayer } from './components/feedback/PulseLayer'
import { QuickAdd } from './components/shell/QuickAdd'
import { Icon } from './components/primitives/Icon'
import { TodosTab } from './features/todos/TodosTab'
import { ChoresTab } from './features/chores/ChoresTab'
import { ChoreAddBar } from './features/chores/ChoreAddBar'
import { ShoppingTab } from './features/shopping/ShoppingTab'
import { ShoppingAddBar } from './features/shopping/ShoppingAddBar'
import { WishlistTab } from './features/wishlist/WishlistTab'
import { WishAddBar } from './features/wishlist/WishAddBar'
import { SettingsSheet } from './features/settings/SettingsSheet'
import { useData, dataActions } from './store/useData'
import {
  applySettings,
  ensureSeeded,
  useProfile,
  useSettings,
} from './store/useProfile'
import { useUI, tabIndex } from './store/useUI'
import { fire } from './lib/haptics'

export default function App() {
  const ready = useData((s) => s.ready)
  const profiles = useData((s) => s.profiles)
  const profileId = useProfile((s) => s.profileId)
  const hydrated = useProfile((s) => s.hydrated)
  const settings = useSettings()
  const tab = useUI((s) => s.tab)
  const openSheet = useUI((s) => s.openSheet)

  useEffect(() => {
    void (async () => {
      await useProfile.getState().hydrate()
      await useData.getState().init()
      await ensureSeeded()
    })()
  }, [])

  // Theme, accent, font scale and haptic config are CSS variables + module
  // state, so a settings change costs a variable write, not a re-render.
  useEffect(() => {
    applySettings(settings)
  }, [settings])

  if (!hydrated || !ready) {
    return <div className="grid h-full place-items-center" style={{ color: 'var(--text-faint)' }} />
  }

  if (!profileId) {
    return (
      <>
        <ProfileSelect
          profiles={profiles}
          onSelect={(id) => void useProfile.getState().selectProfile(id)}
        />
        <PulseLayer />
      </>
    )
  }

  return (
    <div className="relative h-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="h-full"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'todos' && <TodosTab />}
          {tab === 'chores' && <ChoresTab />}
          {tab === 'shopping' && <ShoppingTab />}
          {tab === 'wishlist' && <WishlistTab />}
        </motion.div>
      </AnimatePresence>

      {/* Settings lives in the header rail so the dock stays four clean tabs. */}
      <button
        onClick={() => {
          fire('tap')
          openSheet({ kind: 'settings' })
        }}
        aria-label="Settings"
        className="fixed right-4 z-40 grid h-9 w-9 place-items-center rounded-full safe-top"
        style={{
          top: 14,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
        }}
      >
        <Icon name="settings" size={17} />
      </button>

      <div className="pointer-events-none fixed inset-x-0 z-50 safe-bottom" style={{ bottom: 78 }}>
        {tab === 'todos' && (
          <QuickAdd
            placeholder="Add a to-do…"
            onSubmit={(title, urgency) => dataActions.addTodo(title, urgency, profileId)}
          />
        )}
        {tab === 'chores' && <ChoreAddBar />}
        {tab === 'shopping' && <ShoppingAddBar />}
        {tab === 'wishlist' && <WishAddBar />}
      </div>

      <TabDock />
      <SettingsSheet />
      <PulseLayer />
      <Toaster
        position="top-center"
        offset={54}
        toastOptions={{
          style: {
            background: 'var(--surface-3)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </div>
  )
}

/** Exported for the dock's swipe-between-tabs gesture. */
export { tabIndex }
