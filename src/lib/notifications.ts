import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from './supabase'
import { VAPID_PUBLIC_KEY } from './env'
import {
  isNative,
  isStandalone,
  supportsWebPush,
  webPushBlockedByInstall,
} from './platform'
import type { Chore } from '@/data/types'

/**
 * Two delivery channels, one API.
 *
 *   Avi's APK  → FCM push (arrives with the app closed)
 *   Jackie's   → Web Push (iOS 16.4+, Home Screen install required)
 *
 * Both register a row in `push_subscriptions`; the Edge Function fans out.
 */

export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'default'
  | 'granted'
  | 'denied'

export function pushState(): PushState {
  if (isNative()) {
    // Android 13+ prompts; older versions grant implicitly.
    return 'default'
  }
  if (!supportsWebPush()) return 'unsupported'
  // On iOS a Safari tab can't do Web Push at all, so asking would silently do
  // nothing. Tell the user to install instead of showing a dead button.
  if (webPushBlockedByInstall()) return 'needs-install'
  return Notification.permission as PushState
}

/**
 * VAPID keys are base64url; PushManager wants a BufferSource.
 *
 * Backed by an explicit ArrayBuffer because `Uint8Array.from` widens to
 * ArrayBufferLike, which no longer satisfies BufferSource.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function saveSubscription(row: Record<string, unknown>): Promise<void> {
  const sb = supabase()
  if (!sb) return
  await sb.from('push_subscriptions').upsert(row as never, {
    onConflict: row.platform === 'fcm' ? 'token' : 'endpoint',
  })
}

/**
 * Ask for permission and register.
 *
 * MUST be called from a user gesture. Never prompt on load — a cold prompt gets
 * denied, and on iOS a denial can only be undone by deleting and re-adding the
 * Home Screen icon.
 */
export async function enablePush(profileId: string): Promise<PushState> {
  if (isNative()) return enableNativePush(profileId)
  return enableWebPush(profileId)
}

async function enableNativePush(profileId: string): Promise<PushState> {
  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return 'denied'

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('registration timed out')), 15_000)

      void PushNotifications.addListener('registration', (token) => {
        clearTimeout(timer)
        void saveSubscription({
          profile_id: profileId,
          platform: 'fcm',
          token: token.value,
          user_agent: navigator.userAgent,
          last_seen_at: new Date().toISOString(),
        }).then(resolve, reject)
      })

      void PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timer)
        reject(new Error(String(err.error)))
      })

      void PushNotifications.register()
    })

    // Local notifications cover chore cooldowns with no server involved.
    await LocalNotifications.requestPermissions()
    return 'granted'
  } catch (err) {
    console.error('[push] native registration failed', err)
    return 'denied'
  }
}

async function enableWebPush(profileId: string): Promise<PushState> {
  if (!supportsWebPush()) return 'unsupported'
  if (webPushBlockedByInstall()) return 'needs-install'
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] VITE_VAPID_PUBLIC_KEY is not set')
    return 'unsupported'
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushState

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> }
  await saveSubscription({
    profile_id: profileId,
    platform: 'webpush',
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  })
  return 'granted'
}

export async function disablePush(): Promise<void> {
  const sb = supabase()
  if (!isNative() && supportsWebPush()) {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await sb?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  }
}

// --- local cooldown reminders (native only) --------------------------------

/** Stable positive 32-bit id derived from the chore uuid. */
function notificationId(choreId: string): number {
  let hash = 0
  for (let i = 0; i < choreId.length; i++) {
    hash = (hash * 31 + choreId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 2_000_000_000
}

/**
 * Schedule a local alert for when a chore comes off cooldown.
 *
 * This is strictly better than a server push for Avi: exact timing, no network,
 * works offline. Jackie's iOS PWA can't schedule anything locally, which is why
 * the pg_cron sweep exists for her.
 */
export async function scheduleCooldownReminder(chore: Chore): Promise<void> {
  if (!isNative() || !chore.is_recurring || !chore.next_due_at) return
  const at = new Date(chore.next_due_at)
  if (at.getTime() <= Date.now()) return

  try {
    const id = notificationId(chore.id)
    await LocalNotifications.cancel({ notifications: [{ id }] })
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: 'Ready again',
          body: chore.title,
          schedule: { at },
          extra: { tab: 'chores', itemId: chore.id },
        },
      ],
    })
  } catch (err) {
    console.error('[push] could not schedule reminder', err)
  }
}

export async function cancelCooldownReminder(choreId: string): Promise<void> {
  if (!isNative()) return
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notificationId(choreId) }],
    })
  } catch {
    /* nothing scheduled */
  }
}

/** Whether this device is installed such that push can actually arrive. */
export const pushInstallHint = (): string | null =>
  webPushBlockedByInstall()
    ? 'Add Things to your Home Screen first — iOS only delivers notifications to installed web apps, not Safari tabs.'
    : isStandalone() || isNative()
      ? null
      : null
