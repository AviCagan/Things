import { describe, expect, it } from 'vitest'
import { describeRecurrence, describeWeekdays } from './time'
import type { Weekday } from '@/data/types'

describe('describeWeekdays', () => {
  it('names a single day', () => {
    expect(describeWeekdays([2])).toBe('Tue')
  })

  it('joins two days with &', () => {
    expect(describeWeekdays([2, 3])).toBe('Tue & Wed')
  })

  it('joins three or more with commas and a trailing &', () => {
    expect(describeWeekdays([0, 4, 5])).toBe('Sun, Thu & Fri')
  })

  it('orders Sunday through Saturday regardless of pick order', () => {
    // The user picks Friday then Sunday then Thursday — the label should
    // still read in week order, not selection order.
    expect(describeWeekdays([5, 0, 4] as Weekday[])).toBe('Sun, Thu & Fri')
  })
})

describe('describeRecurrence: weekday mode', () => {
  it('describes the chosen days, ignoring count', () => {
    expect(describeRecurrence(null, 'weekdays', [2, 3])).toBe('Tue & Wed')
  })

  it('is empty with no days chosen, rather than throwing', () => {
    expect(describeRecurrence(null, 'weekdays', [])).toBe('')
    expect(describeRecurrence(null, 'weekdays', null)).toBe('')
  })
})

describe('describeRecurrence: interval mode', () => {
  it('names a known preset', () => {
    expect(describeRecurrence(1, 'weeks', null)).toBe('Weekly')
    expect(describeRecurrence(3, 'months', null)).toBe('Every 3 months')
  })

  it('falls back to a generic phrase off-preset', () => {
    expect(describeRecurrence(5, 'days', null)).toBe('Every 5 days')
    expect(describeRecurrence(1, 'hours', null)).toBe('Every hour')
  })

  it('is empty without a count or a unit', () => {
    expect(describeRecurrence(null, 'days', null)).toBe('')
    expect(describeRecurrence(2, null, null)).toBe('')
  })
})
