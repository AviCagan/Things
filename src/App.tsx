import { useEffect, useState } from 'react'
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
import { PinGate } from './components/shell/PinGate'
import { useData, dataActions } from './store/useData'
import {
  applySettings,
  ensureSeeded,
  useProfile,
  useSettings,
} from './store/useProfile'
import { useUI, tabIndex } from './store/useUI'
import { fire } from './lib/haptics'
import { isConfigured } from './lib/env'
import { hasSession, supabase } from './lib/supabase'
import { createSupabaseAdapter } from './data/supabaseAdapter'
import { drain } from './data/outbox'
import { startCleanup } from './lib/cleanup'

/** Swap the local adapter for Supabase and replay anything queued offline. */
async function goLive() {
  const sb = supabase()
  if (!sb) return
  const adapter = createSupabaseAdapter(sb)
  await drain(adapter).catch(() => 0)
  await useData.getState().setAdapter(adapter)
}

/**
 * Boot is an explicit state machine rather than a set of independent flags.
 *
 * The blank screen after entering the PIN came from exactly that: unlocking
 * flipped `locked` to false while `ready` was still true from a local-adapter
 * init, so the profile screen rendered against an empty local database — no
 * profiles, nothing to tap. And any failure while swapping in the real adapter
 * left `ready` false forever, which is why only a restart recovered it.
 */
type Boot = 'loading' | 'locked' | 'ready' | 'error'

export default function App() {
  const profiles = useData((s) => s.profiles)
  const profileId = useProfile((s) => s.profileId)
  const settings = useSettings()
  const tab = useUI((s) => s.tab)
  const openSheet = useUI((s) => s.openSheet)
  const [boot, setBoot] = useState<Boot>('loading')
  const [bootError, setBootError] = useState<string | null>(null)

  async function start() {
    setBoot('loading')
    setBootError(null)
    try {
      await useProfile.getState().hydrate()

      if (!isConfigured()) {
        // No credentials: the local adapter IS the backend, not a stub.
        await useData.getState().init()
        await ensureSeeded()
        startCleanup()
        setBoot('ready')
        return
      }

      // Configured but no session yet → the PIN is owed once on this device.
      if (!(await hasSession())) {
        setBoot('locked')
        return
      }

      await goLive()
      await ensureSeeded()
      startCleanup()
      setBoot('ready')
    } catch (err) {
      console.error('[boot]', err)
      setBootError(err instanceof Error ? err.message : String(err))
      setBoot('error')
    }
  }

  useEffect(() => {
    void start()
  }, [])

  // Theme, accent, font scale and haptic config are CSS variables + module
  // state, so a settings change costs a variable write, not a re-render.
  useEffect(() => {
    applySettings(settings)
  }, [settings])

  if (boot === 'locked') {
    return (
      <>
        <PinGate
          // Only leave the gate once the real data is actually loaded, so the
          // profile screen never renders against an empty database.
          onUnlocked={async () => {
            try {
              await goLive()
              await ensureSeeded()
              startCleanup()
              setBoot('ready')
            } catch (err) {
              console.error('[unlock]', err)
              setBootError(err instanceof Error ? err.message : String(err))
              setBoot('error')
            }
          }}
        />
        <PulseLayer />
      </>
    )
  }

  if (boot === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <h1 className="text-[20px] font-bold">Couldn't load your lists</h1>
        <p className="text-[14px]" style={{ color: 'var(--text-dim)' }}>
          {bootError ?? 'Something went wrong connecting.'}
        </p>
        <button
          onClick={() => void start()}
          className="rounded-full px-5 py-3 text-[15px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (boot === 'loading') {
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* In normal flow, not floating — a fixed banner would sit on top of the
          header and swallow taps meant for the controls underneath it. */}
      {!isConfigured() && <LocalModeBanner />}

      <div className="relative min-h-0 flex-1">
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

        {/* Settings sits in the header rail so the dock stays four clean tabs.
            Absolute within this wrapper, so it tracks the banner's height. */}
        <button
          onClick={() => {
            fire('tap')
            openSheet({ kind: 'settings' })
          }}
          aria-label="Settings"
          className="absolute right-4 z-40 grid h-9 w-9 place-items-center rounded-full"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          <Icon name="settings" size={17} />
        </button>
      </div>

      {/* Sits clear of the dock: 6px padding + 54px slot + 6px + 10px margin. */}
      <div className="pointer-events-none fixed inset-x-0 z-50 safe-bottom" style={{ bottom: 86 }}>
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

/**
 * Shown only when Supabase credentials are absent. The app is fully functional
 * in this state — it just isn't shared yet — so the message says that plainly
 * rather than presenting as an error.
 */
function LocalModeBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-3 mt-2 flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 safe-top"
      style={{
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--warn)' }} />
      <span className="flex-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
        On this device only — not syncing yet
      </span>
      <button
        onClick={() => {
          fire('tap')
          setDismissed(true)
        }}
        aria-label="Dismiss"
        style={{ color: 'var(--text-faint)' }}
      >
        <Icon name="close" size={14} />
      </button>
    </motion.div>
  )
}

/** Exported for the dock's swipe-between-tabs gesture. */
export { tabIndex }
