import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import type { HapticEventName, HapticIntensity } from '@/data/types'
import { isNative, isIOS } from './platform'

/**
 * One haptics entry point for the whole app.
 *
 * Call sites use semantic events ('claim', 'complete') and never mention
 * intensity — that mapping lives here, so retuning the feel is a single-file
 * change and the iOS fallback stays automatically in sync.
 */

type Level =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'notif-success'
  | 'notif-warning'
  | 'notif-error'

interface EventSpec {
  level: Level
  /** navigator.vibrate pattern for Android web, in ms. */
  pattern: number | number[]
}

const EVENTS: Record<HapticEventName, EventSpec> = {
  tap: { level: 'light', pattern: 12 },
  toggleOn: { level: 'medium', pattern: 20 },
  toggleOff: { level: 'light', pattern: 12 },
  claim: { level: 'heavy', pattern: [16, 28, 24] },
  complete: { level: 'notif-success', pattern: [22, 34, 40] },
  delete: { level: 'heavy', pattern: [26, 20, 26] },
  swipeThreshold: { level: 'medium', pattern: 18 },
  longPress: { level: 'heavy', pattern: 32 },
  dragStart: { level: 'medium', pattern: 16 },
  snap: { level: 'selection', pattern: 8 },
  success: { level: 'notif-success', pattern: [20, 30, 36] },
  warning: { level: 'notif-warning', pattern: [30, 40, 30] },
  error: { level: 'notif-error', pattern: [40, 50, 40, 50, 40] },
}

const IMPACT_ORDER: Level[] = ['selection', 'light', 'medium', 'heavy']

/** Notification haptics never shift level — their semantics are the point. */
const isNotification = (l: Level) => l.startsWith('notif-')

function shift(level: Level, direction: -1 | 0 | 1): Level {
  if (direction === 0 || isNotification(level)) return level
  const i = IMPACT_ORDER.indexOf(level)
  if (i < 0) return level
  const next = Math.min(IMPACT_ORDER.length - 1, Math.max(0, i + direction))
  return IMPACT_ORDER[next]
}

function scalePattern(
  pattern: number | number[],
  factor: number,
): number | number[] {
  const cap = (n: number) => Math.min(400, Math.max(1, Math.round(n * factor)))
  return typeof pattern === 'number' ? cap(pattern) : pattern.map(cap)
}

// --- settings, pushed in from the profile store -----------------------------

let intensity: HapticIntensity = 'normal'
let perEvent: Partial<Record<HapticEventName, boolean>> = {}
/** Visual fallback sink, wired up by the feedback layer on iOS. */
let pulseSink: ((event: HapticEventName) => void) | null = null
let soundSink: ((event: HapticEventName) => void) | null = null

export function configureHaptics(next: {
  intensity: HapticIntensity
  perEvent: Partial<Record<HapticEventName, boolean>>
}) {
  intensity = next.intensity
  perEvent = next.perEvent ?? {}
}

export function setFeedbackSinks(opts: {
  pulse?: (event: HapticEventName) => void
  sound?: (event: HapticEventName) => void
}) {
  if (opts.pulse) pulseSink = opts.pulse
  if (opts.sound) soundSink = opts.sound
}

// --- backend resolution -----------------------------------------------------

type Backend = 'native' | 'vibrate' | 'none'

let backend: Backend | null = null
let vibrateProbed = false

function resolveBackend(): Backend {
  if (backend) return backend
  if (isNative()) backend = 'native'
  // iOS has no vibration API in any browser. No polyfill exists.
  else if (!isIOS() && typeof navigator !== 'undefined' && 'vibrate' in navigator)
    backend = 'vibrate'
  else backend = 'none'
  return backend
}

/**
 * navigator.vibrate needs a prior user gesture and silently no-ops when the
 * document is hidden. Probe once so we don't keep calling into nothing.
 */
function canVibrate(): boolean {
  if (typeof document !== 'undefined' && document.hidden) return false
  vibrateProbed = true
  return true
}

// --- rate limiting ----------------------------------------------------------

/**
 * Without this, drag-reorder and fast scrolling emit a continuous buzz that
 * reads as broken hardware and drains battery. This single line is most of the
 * difference between "heavy haptics" feeling premium and feeling defective.
 */
const MIN_GAP_MS = 40
let lastFiredAt = 0

// --- public API -------------------------------------------------------------

/** Fire-and-forget. Never throws, never awaited, safe to call from render. */
export function fire(event: HapticEventName): void {
  if (perEvent[event] === false) return
  if (intensity === 'off') {
    // Visual/audio channels are independent of haptics being muted.
    pulseSink?.(event)
    soundSink?.(event)
    return
  }

  const now = Date.now()
  if (now - lastFiredAt < MIN_GAP_MS) return
  lastFiredAt = now

  const spec = EVENTS[event]
  const direction = intensity === 'subtle' ? -1 : intensity === 'heavy' ? 1 : 0
  const level = shift(spec.level, direction)
  const factor = intensity === 'subtle' ? 0.5 : intensity === 'heavy' ? 1.6 : 1

  // Visual + audio always run: on iOS they are the whole experience, and
  // elsewhere they reinforce rather than replace.
  pulseSink?.(event)
  soundSink?.(event)

  switch (resolveBackend()) {
    case 'native':
      void fireNative(level)
      return
    case 'vibrate':
      if (!vibrateProbed || canVibrate()) {
        try {
          navigator.vibrate(scalePattern(spec.pattern, factor))
        } catch {
          /* vibrate is best-effort by definition */
        }
      }
      return
    case 'none':
      return
  }
}

async function fireNative(level: Level): Promise<void> {
  try {
    switch (level) {
      case 'selection':
        await Haptics.selectionStart()
        await Haptics.selectionChanged()
        await Haptics.selectionEnd()
        return
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light })
        return
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium })
        return
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy })
        return
      case 'notif-success':
        await Haptics.notification({ type: NotificationType.Success })
        return
      case 'notif-warning':
        await Haptics.notification({ type: NotificationType.Warning })
        return
      case 'notif-error':
        await Haptics.notification({ type: NotificationType.Error })
        return
    }
  } catch {
    /* Plugin missing or unavailable — feel degrades, app does not break. */
  }
}

/**
 * Continuous selection feedback for drag-reorder and the urgency wheel, where a
 * stream of ticks is exactly right. Rate-limited like everything else.
 */
export function selectionTick(): void {
  fire('snap')
}

export const ALL_HAPTIC_EVENTS = Object.keys(EVENTS) as HapticEventName[]

/** True when this device can actually produce a haptic, for honest UI copy. */
export const hasRealHaptics = (): boolean => resolveBackend() !== 'none'
