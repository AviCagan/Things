import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { URGENCY_META, type Urgency } from '@/data/types'
import { fire } from '@/lib/haptics'

/**
 * Radial urgency picker, opened by long-pressing a row and anchored under the
 * thumb. Drag across the arcs and release to commit — faster than a dropdown
 * and the reason urgency is worth setting at all.
 */

const LEVELS: Urgency[] = [0, 1, 2, 3]
const COLORS: Record<Urgency, string> = {
  0: 'var(--u-chill)',
  1: 'var(--u-normal)',
  2: 'var(--u-high)',
  3: 'var(--u-urgent)',
}

const RADIUS = 92

export function UrgencyWheel({
  origin,
  current,
  onPick,
  onClose,
}: {
  origin: { x: number; y: number }
  current: Urgency
  onPick: (u: Urgency) => void
  onClose: () => void
}) {
  const [active, setActive] = useState<Urgency>(current)
  const activeRef = useRef<Urgency>(current)

  // Fan the arcs upward, and flip if the touch was near the top of the screen.
  const flip = origin.y < RADIUS + 80
  const spread = 150
  const start = flip ? 90 - spread / 2 : 270 - spread / 2

  const positions = LEVELS.map((_, i) => {
    const angle = ((start + (spread / (LEVELS.length - 1)) * i) * Math.PI) / 180
    return { dx: Math.cos(angle) * RADIUS, dy: Math.sin(angle) * RADIUS }
  })

  useEffect(() => {
    function move(e: PointerEvent) {
      let best: Urgency = activeRef.current
      let bestDist = Infinity
      positions.forEach((p, i) => {
        const d = Math.hypot(
          e.clientX - (origin.x + p.dx),
          e.clientY - (origin.y + p.dy),
        )
        if (d < bestDist) {
          bestDist = d
          best = LEVELS[i]
        }
      })
      // Only snap when actually near an arc, so small jitters don't reassign.
      if (bestDist < 64 && best !== activeRef.current) {
        activeRef.current = best
        setActive(best)
        fire('snap')
      }
    }

    function up() {
      onPick(activeRef.current)
      onClose()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [origin.x, origin.y, onPick, onClose])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ background: 'rgb(0 0 0 / 0.45)', backdropFilter: 'blur(2px)' }}
      >
        {LEVELS.map((level, i) => {
          const p = positions[i]
          const isActive = active === level
          return (
            <motion.div
              key={level}
              initial={{ x: origin.x, y: origin.y, scale: 0.2, opacity: 0 }}
              animate={{
                x: origin.x + p.dx,
                y: origin.y + p.dy,
                scale: isActive ? 1.18 : 1,
                opacity: 1,
              }}
              transition={{ type: 'spring', stiffness: 460, damping: 28, delay: i * 0.02 }}
              className="pointer-events-none absolute grid place-items-center rounded-full"
              style={{
                width: 62,
                height: 62,
                marginLeft: -31,
                marginTop: -31,
                background: isActive ? COLORS[level] : 'var(--surface-3)',
                border: `2px solid ${COLORS[level]}`,
                color: isActive ? '#fff' : 'var(--text)',
                boxShadow: isActive ? `0 0 22px ${COLORS[level]}` : 'none',
              }}
            >
              <span className="text-[11px] font-semibold">
                {URGENCY_META[level].short}
              </span>
            </motion.div>
          )
        })}
      </motion.div>
    </AnimatePresence>
  )
}
