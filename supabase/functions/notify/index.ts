// Things — notification sender (Supabase Edge Function, Deno)
//
// The only genuinely server-side component in this app, and therefore the only
// place that can hold real secrets: the FCM service account and the VAPID
// private key never reach a client.
//
// Invoked two ways:
//   1. Database Webhooks on insert/update of the list tables (see
//      005_notifications.sql). Server-side triggering matters — notifying from
//      the client would send nothing when the acting person's app is closed.
//   2. A pg_cron sweep for chores coming off cooldown, which no row change can
//      announce because nothing is written when a cooldown expires.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//            VAPID_SUBJECT=mailto:you@example.com \
//            FCM_SERVICE_ACCOUNT='<the full service-account JSON>'

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { JWT } from 'npm:google-auth-library@9'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:things@example.com'
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

type NotifyEvent = 'claim_complete' | 'cooldown_ready' | 'urgent_added' | 'any_added'

interface Push {
  title: string
  body: string
  tab?: string
  itemId?: string
  tag?: string
}

// --- payload shaping --------------------------------------------------------

const TAB_FOR: Record<string, string> = {
  todos: 'todos',
  chores: 'chores',
  shopping_items: 'shopping',
  wishlist_items: 'wishlist',
}

const NOUN: Record<string, string> = {
  todos: 'to-do',
  chores: 'chore',
  shopping_items: 'shopping item',
  wishlist_items: 'wish',
}

interface Row {
  id: string
  title: string
  urgency?: number
  claimed_by?: string | null
  created_by?: string | null
  is_done?: boolean
  last_completed_by?: string | null
}

interface WebhookBody {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Row | null
  old_record: Row | null
}

/**
 * Decide what (if anything) this change should announce, and to whom.
 *
 * `any_added` fully subsumes `urgent_added`, so an insert resolves to exactly
 * one event and the recipient never gets two notifications for one action.
 */
function classify(
  body: WebhookBody,
): { event: NotifyEvent; actorId: string | null; targetId: string | null; push: Push } | null {
  const { type, table, record, old_record } = body
  if (!record) return null

  const tab = TAB_FOR[table]
  const noun = NOUN[table] ?? 'item'

  if (type === 'INSERT') {
    const urgent = (record.urgency ?? 0) >= 3
    return {
      event: urgent ? 'urgent_added' : 'any_added',
      actorId: record.created_by ?? null,
      targetId: null, // the other person, resolved later
      push: {
        title: urgent ? `Urgent ${noun}` : `New ${noun}`,
        body: record.title,
        tab,
        itemId: record.id,
        tag: `add-${record.id}`,
      },
    }
  }

  if (type === 'UPDATE' && old_record) {
    // Newly claimed
    if (!old_record.claimed_by && record.claimed_by) {
      return {
        event: 'claim_complete',
        actorId: record.claimed_by,
        targetId: record.created_by ?? null,
        push: {
          title: 'Claimed',
          body: record.title,
          tab,
          itemId: record.id,
          tag: `claim-${record.id}`,
        },
      }
    }
    // Newly completed (one-off)
    if (!old_record.is_done && record.is_done) {
      return {
        event: 'claim_complete',
        actorId: null,
        targetId: record.created_by ?? null,
        push: {
          title: 'Done',
          body: record.title,
          tab,
          itemId: record.id,
          tag: `done-${record.id}`,
        },
      }
    }
    // Recurring chore completed — starts a cooldown rather than finishing.
    if (
      table === 'chores' &&
      record.last_completed_by &&
      old_record.last_completed_by !== record.last_completed_by
    ) {
      return {
        event: 'claim_complete',
        actorId: record.last_completed_by,
        targetId: null,
        push: {
          title: 'Chore done',
          body: `${record.title} — resting now`,
          tab: 'chores',
          itemId: record.id,
          tag: `chore-${record.id}`,
        },
      }
    }
  }

  return null
}

// --- delivery ---------------------------------------------------------------

interface Subscription {
  id: string
  platform: 'fcm' | 'webpush'
  token: string | null
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

let cachedFcmToken: { value: string; expires: number } | null = null

async function fcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  if (!FCM_SERVICE_ACCOUNT) return null
  const creds = JSON.parse(FCM_SERVICE_ACCOUNT)

  if (cachedFcmToken && cachedFcmToken.expires > Date.now() + 60_000) {
    return { token: cachedFcmToken.value, projectId: creds.project_id }
  }

  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const { access_token } = await jwt.authorize()
  if (!access_token) return null

  cachedFcmToken = { value: access_token, expires: Date.now() + 55 * 60_000 }
  return { token: access_token, projectId: creds.project_id }
}

async function sendFcm(sub: Subscription, push: Push): Promise<boolean> {
  const auth = await fcmAccessToken()
  if (!auth || !sub.token) return false

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: sub.token,
          notification: { title: push.title, body: push.body },
          data: {
            tab: push.tab ?? '',
            itemId: push.itemId ?? '',
          },
          android: {
            priority: 'HIGH',
            notification: { tag: push.tag, color: '#7c5cff' },
          },
        },
      }),
    },
  )

  // 404/410 mean the app was uninstalled or the token rotated.
  if (res.status === 404 || res.status === 410) {
    await db.from('push_subscriptions').delete().eq('id', sub.id)
    return false
  }
  return res.ok
}

async function sendWebPush(sub: Subscription, push: Push): Promise<boolean> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !sub.endpoint) return false
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh!, auth: sub.auth! },
      },
      JSON.stringify(push),
    )
    return true
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    // The subscription is dead — usually the icon was deleted from the Home
    // Screen, which silently ends Web Push on iOS.
    if (status === 404 || status === 410) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
    }
    return false
  }
}

async function deliver(profileIds: string[], event: NotifyEvent, push: Push) {
  if (profileIds.length === 0) return { sent: 0, skipped: 0 }

  const { data: settings } = await db
    .from('profile_settings')
    .select('profile_id, notify_events')
    .in('profile_id', profileIds)

  const allowed = (settings ?? [])
    .filter((s) => (s.notify_events ?? {})[event] !== false)
    .map((s) => s.profile_id)

  if (allowed.length === 0) return { sent: 0, skipped: profileIds.length }

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, platform, token, endpoint, p256dh, auth, profile_id')
    .in('profile_id', allowed)

  let sent = 0
  for (const sub of (subs ?? []) as (Subscription & { profile_id: string })[]) {
    const ok =
      sub.platform === 'fcm'
        ? await sendFcm(sub, push)
        : await sendWebPush(sub, push)
    if (ok) sent++
  }
  return { sent, skipped: profileIds.length - allowed.length }
}

/** Everyone except the person who caused the change. */
async function recipients(actorId: string | null, explicitTarget: string | null) {
  if (explicitTarget && explicitTarget !== actorId) return [explicitTarget]
  const { data } = await db.from('profiles').select('id')
  return (data ?? []).map((p) => p.id).filter((id) => id !== actorId)
}

// --- cooldown sweep ---------------------------------------------------------

/**
 * Chores whose cooldown has expired.
 *
 * This needs a scheduled sweep specifically because cooldown expiry writes no
 * row, so there is no change event to hook. `cooldown_notified_at` makes it
 * idempotent — a retry or an overlapping run cannot double-send.
 */
async function sweepCooldowns() {
  const { data: due } = await db
    .from('chores')
    .select('id, title, next_due_at, cooldown_notified_at')
    .eq('is_recurring', true)
    .lte('next_due_at', new Date().toISOString())
    .is('cooldown_notified_at', null)

  let total = 0
  for (const chore of due ?? []) {
    const ids = await recipients(null, null)
    const { sent } = await deliver(ids, 'cooldown_ready', {
      title: 'Ready again',
      body: chore.title,
      tab: 'chores',
      itemId: chore.id,
      tag: `cooldown-${chore.id}`,
    })
    total += sent
    await db
      .from('chores')
      .update({ cooldown_notified_at: new Date().toISOString() })
      .eq('id', chore.id)
  }
  return total
}

// --- entrypoint -------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))

    if (body.mode === 'sweep_cooldowns') {
      const sent = await sweepCooldowns()
      return Response.json({ ok: true, mode: 'sweep', sent })
    }

    const classified = classify(body as WebhookBody)
    if (!classified) return Response.json({ ok: true, skipped: 'no-op' })

    const ids = await recipients(classified.actorId, classified.targetId)
    const result = await deliver(ids, classified.event, classified.push)

    return Response.json({ ok: true, event: classified.event, ...result })
  } catch (err) {
    console.error(err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})
