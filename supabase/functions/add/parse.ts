// Pure command parsing — no Deno, no network, no secrets.
//
// Split out of index.ts so the app's own Vitest suite can import and test it
// directly, the same way notify/classify.ts and calendar/ics.ts are.

export type ListName = 'todos' | 'chores' | 'shopping_items' | 'wishlist_items'

export interface ParsedCommand {
  list: ListName
  title: string
  urgency: number
}

/** Must track `URGENCY.URGENT` in src/data/types.ts. */
export const URGENT_LEVEL = 2
const DEFAULT_URGENCY = 1

/**
 * What someone might plausibly call each list out loud. Ordered longest-first
 * at match time so "shopping list" wins over "list".
 */
const LIST_ALIASES: Record<string, ListName> = {
  todo: 'todos',
  todos: 'todos',
  'to do': 'todos',
  'to-do': 'todos',
  task: 'todos',
  tasks: 'todos',
  chore: 'chores',
  chores: 'chores',
  // The raw table names, so a shortcut configured with the literal value this
  // API returns keeps working. Underscores are normalised to spaces first.
  'shopping items': 'shopping_items',
  'wishlist items': 'wishlist_items',
  shopping: 'shopping_items',
  shop: 'shopping_items',
  store: 'shopping_items',
  grocery: 'shopping_items',
  groceries: 'shopping_items',
  wishlist: 'wishlist_items',
  wish: 'wishlist_items',
  wishes: 'wishlist_items',
  want: 'wishlist_items',
  wants: 'wishlist_items',
}

export function resolveList(raw: string | null | undefined): ListName | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase().replace(/_/g, ' ')
  return LIST_ALIASES[key] ?? LIST_ALIASES[key.replace(/\s+list$/, '')] ?? null
}

/** Assistants love to prepend filler; none of it belongs in the item title. */
// The trailing (?:\s+|$) matters: without it a bare "add" fails to match and
// survives as the item's title.
const LEAD_NOISE =
  /^(?:hey\s+|ok\s+|okay\s+)?(?:google|siri|gemini|assistant)?[,\s]*(?:please\s+)?(?:can you\s+)?(?:go ahead and\s+)?(?:add|put|append|remember|note)(?:\s+|$)/i

const URGENT_WORDS = /\b(?:urgent|urgently|asap|right away|important)\b/gi

/**
 * "add milk to the shopping list" → { list: shopping_items, title: "Milk" }
 *
 * `listHint` wins when supplied, which is the normal case: a Shortcut or an
 * IFTTT applet is set up once per list, so the phrase itself only has to carry
 * the item. Inferring from the sentence is the fallback for a single
 * catch-all shortcut.
 */
export function parseCommand(
  text: string,
  listHint?: string | null,
): ParsedCommand | null {
  let body = (text ?? '').trim()
  if (!body) return null

  body = body.replace(LEAD_NOISE, '').trim()

  let list = resolveList(listHint)

  // "... to the shopping list" / "... to shopping". Only strip the trailing
  // phrase when it actually names a list, so "add a note to the fridge" keeps
  // its words.
  if (!list) {
    const trailing = body.match(/\s+(?:to|on|in)\s+(?:the\s+|my\s+|our\s+)?([\w -]+?)(?:\s+list)?\s*$/i)
    const matched = trailing ? resolveList(trailing[1]) : null
    if (matched) {
      list = matched
      body = body.slice(0, trailing!.index).trim()
    }
  }

  let urgency = DEFAULT_URGENCY
  if (URGENT_WORDS.test(body)) {
    urgency = URGENT_LEVEL
    // Reset lastIndex — the regex is global, so a stale index would make the
    // very next call skip the start of its own string.
    URGENT_WORDS.lastIndex = 0
    body = body.replace(URGENT_WORDS, ' ')
  }
  URGENT_WORDS.lastIndex = 0

  // Strip articles left dangling by the removals above, then tidy whitespace.
  const title = body
    .replace(/^(?:an?|the|some)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;]+$/, '')
    .trim()

  if (!title) return null

  return {
    list: list ?? 'todos',
    title: title.charAt(0).toUpperCase() + title.slice(1),
    urgency,
  }
}
