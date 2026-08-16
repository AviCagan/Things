// Things — voice add endpoint (Supabase Edge Function, Deno)
//
// One URL that adds an item to a list from plain text, so both assistants can
// drive the app without either of them needing to know it exists:
//
//   Siri     → Shortcuts app → "Get Contents of URL"
//   Gemini / Google Assistant → IFTTT applet, or an Android shortcut
//
// Neither platform offers a real third-party voice integration for something
// like this — Apple's App Intents need a native App Store app, and Google Home
// routines cannot make arbitrary HTTP calls. A plain authenticated endpoint is
// what both can actually reach, so that is what this is.
//
// Auth is a token in the URL, matched against household_settings.voice_token.
// Same posture as the calendar feed: unguessable, revocable from Settings, and
// scoped to exactly one capability — this can only add items.
//
// Deploy: supabase functions deploy add --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseCommand, type ListName } from './parse.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Every list this can write to, and the columns each one needs. */
function rowFor(
  list: ListName,
  title: string,
  urgency: number,
  profileId: string | null,
): Record<string, unknown> {
  const now = new Date().toISOString()
  const base = {
    title,
    created_by: profileId,
    sort_order: Date.now(),
    created_at: now,
    updated_at: now,
  }

  if (list === 'wishlist_items') {
    // Wishes have no urgency — they have a desire level, and 3 is the neutral
    // middle of that scale rather than a translation of anything said aloud.
    return { ...base, desire_level: 3, owner_id: profileId }
  }
  if (list === 'chores') {
    // Added by voice means a one-off. Setting up a recurrence is a decision
    // with a schedule attached, which is not something to infer from a phrase.
    return { ...base, urgency, claimed_by: null, is_recurring: false, is_done: false }
  }
  return { ...base, urgency, claimed_by: null, is_done: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = new URL(req.url)
    // Accept both shapes: a GET with query params is far easier to paste into
    // an IFTTT applet, a POST body is tidier in Shortcuts. Support both rather
    // than making someone fight whichever one their tool prefers.
    const body =
      req.method === 'POST'
        ? await req.json().catch(() => ({} as Record<string, unknown>))
        : {}

    const param = (name: string): string | null =>
      (body as Record<string, unknown>)[name] != null
        ? String((body as Record<string, unknown>)[name])
        : url.searchParams.get(name)

    const token = param('token')
    if (!token) return json({ ok: false, error: 'token required' }, 401)

    const { data: settings } = await db
      .from('household_settings')
      .select('voice_token')
      .eq('singleton', true)
      .maybeSingle()

    // Reject before comparing when the feature is off, so a null token in the
    // database can never be satisfied by a missing one in the request.
    if (!settings?.voice_token) {
      return json({ ok: false, error: 'voice adding is turned off' }, 403)
    }
    if (settings.voice_token !== token) {
      return json({ ok: false, error: 'bad token' }, 403)
    }

    const text = param('text') ?? param('q') ?? ''
    const parsed = parseCommand(text, param('list'))
    if (!parsed) return json({ ok: false, error: 'nothing to add' }, 400)

    // Attribute to a named person when one is given, so the activity log and
    // the scoreboard stay honest about who asked for it.
    const who = param('who')
    let profileId: string | null = null
    if (who) {
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('slug', who.trim().toLowerCase())
        .maybeSingle()
      profileId = profile?.id ?? null
    }

    const { error } = await db
      .from(parsed.list)
      .insert(rowFor(parsed.list, parsed.title, parsed.urgency, profileId))

    if (error) return json({ ok: false, error: error.message }, 500)

    // Spoken back by Siri and read out by IFTTT, so it has to be a sentence a
    // person would want to hear rather than a status code.
    return json({
      ok: true,
      list: parsed.list,
      title: parsed.title,
      spoken: `Added ${parsed.title}`,
    })
  } catch (err) {
    console.error(err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
