import { motion } from 'motion/react'
import { Icon, type IconName } from '../primitives/Icon'
import { TABS, useUI } from '@/store/useUI'
import { fire } from '@/lib/haptics'
import type { TabKey } from '@/data/types'

/**
 * Floating pill dock — not a flat tab bar.
 *
 * The active pill is a single element with a shared `layoutId`, so it
 * physically slides between tabs instead of cross-fading, and the active label
 * expands inline.
 */
export function TabDock() {
  const tab = useUI((s) => s.tab)
  const setTab = useUI((s) => s.setTab)

  function select(next: TabKey) {
    if (next === tab) return
    fire('snap')
    setTab(next)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center safe-bottom">
      <nav
        className="pointer-events-auto mx-4 mb-3 flex items-center gap-1 rounded-full p-1.5"
        style={{
          background: 'var(--dock-bg)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-dock)',
        }}
      >
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex items-center gap-1.5 rounded-full px-3.5 py-2.5"
              style={{ color: active ? '#fff' : 'var(--text-dim)' }}
            >
              {active && (
                <motion.span
                  layoutId="dock-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              <span className="relative z-10">
                <Icon name={t.icon as IconName} size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              <motion.span
                className="relative z-10 overflow-hidden whitespace-nowrap text-[13px] font-semibold"
                initial={false}
                animate={{
                  width: active ? 'auto' : 0,
                  opacity: active ? 1 : 0,
                  marginLeft: active ? 0 : -6,
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              >
                {t.label}
              </motion.span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
