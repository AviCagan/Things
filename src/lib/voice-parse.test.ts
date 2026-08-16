import { describe, expect, it } from 'vitest'
import { parseCommand, resolveList, URGENT_LEVEL } from '../../supabase/functions/add/parse'
import { URGENCY } from '@/data/types'

/**
 * Tests the exact module the Edge Function ships, imported directly rather
 * than duplicated — same arrangement as notify/classify.ts, and for the same
 * reason: a threshold that drifts out of step with the app is invisible until
 * someone notices a feature quietly stopped working.
 */

describe('URGENT_LEVEL', () => {
  it('tracks the app-wide urgency scale', () => {
    expect(URGENT_LEVEL).toBe(URGENCY.URGENT)
  })
})

describe('resolveList', () => {
  it('accepts the names people actually say', () => {
    expect(resolveList('groceries')).toBe('shopping_items')
    expect(resolveList('shopping list')).toBe('shopping_items')
    expect(resolveList('to-do')).toBe('todos')
    expect(resolveList('chores')).toBe('chores')
    expect(resolveList('wishlist')).toBe('wishlist_items')
  })

  it('accepts the raw table names a shortcut would be configured with', () => {
    expect(resolveList('shopping_items')).toBe('shopping_items')
    expect(resolveList('todos')).toBe('todos')
  })

  it('returns null for anything it does not recognise', () => {
    expect(resolveList('fridge')).toBeNull()
    expect(resolveList('')).toBeNull()
    expect(resolveList(null)).toBeNull()
  })
})

describe('parseCommand', () => {
  it('takes the list hint when one is given', () => {
    const c = parseCommand('milk', 'shopping')
    expect(c).toEqual({ list: 'shopping_items', title: 'Milk', urgency: 1 })
  })

  it('infers the list from the sentence when there is no hint', () => {
    const c = parseCommand('add milk to the shopping list')
    expect(c?.list).toBe('shopping_items')
    expect(c?.title).toBe('Milk')
  })

  it('strips assistant filler', () => {
    expect(parseCommand('Hey Google, add bread')?.title).toBe('Bread')
    expect(parseCommand('please add bread')?.title).toBe('Bread')
    expect(parseCommand('OK Google can you add bread')?.title).toBe('Bread')
  })

  it('picks up urgency and removes the word from the title', () => {
    const c = parseCommand('urgent: call the plumber', 'todos')
    expect(c?.urgency).toBe(URGENT_LEVEL)
    expect(c?.title).not.toMatch(/urgent/i)
  })

  it('defaults to medium urgency', () => {
    expect(parseCommand('call the plumber', 'todos')?.urgency).toBe(1)
  })

  it('does not strip a trailing phrase that is not a list name', () => {
    const c = parseCommand('add a note to the fridge', 'todos')
    expect(c?.title).toBe('Note to the fridge')
  })

  it('falls back to to-dos when nothing names a list', () => {
    expect(parseCommand('water the plants')?.list).toBe('todos')
  })

  it('rejects empty and filler-only input', () => {
    expect(parseCommand('')).toBeNull()
    expect(parseCommand('   ')).toBeNull()
    expect(parseCommand('add')).toBeNull()
  })

  it('tidies punctuation and capitalises', () => {
    expect(parseCommand('add  eggs.', 'shopping')?.title).toBe('Eggs')
  })

  it('does not leak regex state between calls', () => {
    // URGENT_WORDS is a global regex; a stale lastIndex would make the second
    // call miss a match at the start of its own string.
    parseCommand('urgent thing one', 'todos')
    expect(parseCommand('urgent thing two', 'todos')?.urgency).toBe(URGENT_LEVEL)
    expect(parseCommand('urgent thing three', 'todos')?.urgency).toBe(URGENT_LEVEL)
  })
})
