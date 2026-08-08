import type { HapticEventName } from '@/data/types'

/**
 * Synthesised feedback ticks — no asset files, a distinct timbre per event.
 *
 * This is the audible half of Jackie's feedback channel, since iOS Safari has
 * no haptics at all. Default off; enabled per profile.
 */

interface Tone {
  freq: number
  /** seconds */
  dur: number
  type: OscillatorType
  gain: number
  /** optional second blip, for events that should feel like a "ta-da" */
  then?: { freq: number; delay: number }
}

const TONES: Record<HapticEventName, Tone> = {
  tap: { freq: 660, dur: 0.03, type: 'sine', gain: 0.05 },
  toggleOn: { freq: 880, dur: 0.05, type: 'sine', gain: 0.07 },
  toggleOff: { freq: 520, dur: 0.05, type: 'sine', gain: 0.06 },
  claim: { freq: 740, dur: 0.06, type: 'triangle', gain: 0.08, then: { freq: 990, delay: 0.06 } },
  complete: { freq: 880, dur: 0.07, type: 'sine', gain: 0.09, then: { freq: 1320, delay: 0.07 } },
  delete: { freq: 300, dur: 0.09, type: 'sawtooth', gain: 0.06 },
  swipeThreshold: { freq: 600, dur: 0.025, type: 'sine', gain: 0.05 },
  longPress: { freq: 420, dur: 0.06, type: 'triangle', gain: 0.07 },
  dragStart: { freq: 500, dur: 0.03, type: 'sine', gain: 0.05 },
  snap: { freq: 1100, dur: 0.018, type: 'sine', gain: 0.04 },
  success: { freq: 880, dur: 0.07, type: 'sine', gain: 0.09, then: { freq: 1320, delay: 0.07 } },
  warning: { freq: 480, dur: 0.09, type: 'triangle', gain: 0.08 },
  error: { freq: 220, dur: 0.14, type: 'sawtooth', gain: 0.08 },
}

let ctx: AudioContext | null = null
let enabled = false

export function setSoundEnabled(next: boolean) {
  enabled = next
}

/**
 * iOS suspends any AudioContext created outside a user gesture, and a suspended
 * context never recovers on its own — creating this at import time yields a
 * permanently silent app. So it is created lazily, inside the first real touch.
 */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

function blip(at: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number) {
  const osc = at.createOscillator()
  const env = at.createGain()
  osc.type = type
  osc.frequency.value = freq

  const t = at.currentTime
  // Fast attack, exponential decay — a click rather than a beep.
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(gain, t + 0.005)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(env).connect(at.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export function play(event: HapticEventName): void {
  if (!enabled || !ctx || ctx.state !== 'running') return
  const tone = TONES[event]
  if (!tone) return
  try {
    blip(ctx, tone.freq, tone.dur, tone.type, tone.gain)
    if (tone.then) {
      const { freq, delay } = tone.then
      setTimeout(() => {
        if (ctx?.state === 'running') blip(ctx, freq, tone.dur, tone.type, tone.gain * 0.8)
      }, delay * 1000)
    }
  } catch {
    /* audio is a bonus channel, never the only signal */
  }
}
