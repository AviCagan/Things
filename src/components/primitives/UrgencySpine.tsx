import type { Urgency } from '@/data/types'

/**
 * Urgency as a leading-edge spine.
 *
 * Encoded in thickness, height AND luminance together — three redundant
 * channels, so it reads pre-attentively while scrolling and stays legible
 * without relying on hue alone.
 */

const SPEC: Record<Urgency, { w: number; h: string; color: string; glow: boolean }> = {
  0: { w: 2, h: '38%', color: 'var(--u-chill)', glow: false },
  1: { w: 3, h: '68%', color: 'var(--u-normal)', glow: false },
  2: { w: 4, h: '100%', color: 'var(--u-high)', glow: false },
  3: { w: 5, h: '100%', color: 'var(--u-urgent)', glow: true },
}

export function UrgencySpine({ urgency }: { urgency: Urgency }) {
  const s = SPEC[urgency]
  return (
    <div className="absolute inset-y-0 left-0 flex items-center" aria-hidden>
      <div
        className={s.glow ? 'urgent-glow' : undefined}
        style={{
          width: s.w,
          height: s.h,
          background: s.color,
          borderRadius: '0 4px 4px 0',
          opacity: urgency === 0 ? 0.7 : 1,
        }}
      />
    </div>
  )
}
