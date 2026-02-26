import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  arrayEquals,
  isString,
  notBlank,
  arrayUnique,
  regexEscape,
  sleep,
  timeAgo,
} from './utils'

// ---------------------------------------------------------------------------
// arrayEquals
// ---------------------------------------------------------------------------
describe('arrayEquals', () => {
  it('returns true for identical arrays', () => {
    expect(arrayEquals([1, 2, 3], [1, 2, 3])).toBe(true)
  })
  it('returns false for arrays with different lengths', () => {
    expect(arrayEquals([1, 2], [1, 2, 3])).toBe(false)
  })
  it('returns false for arrays with different values', () => {
    expect(arrayEquals([1, 2, 3], [1, 2, 4])).toBe(false)
  })
  it('returns false if first argument is not an array', () => {
    expect(arrayEquals('abc', [1])).toBe(false)
  })
  it('returns true for two empty arrays', () => {
    expect(arrayEquals([], [])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isString
// ---------------------------------------------------------------------------
describe('isString', () => {
  it('returns true for a primitive string', () => {
    expect(isString('hello')).toBe(true)
  })
  it('returns true for a String object', () => {
    expect(isString(new String('hello'))).toBe(true)
  })
  it('returns false for a number', () => {
    expect(isString(42)).toBe(false)
  })
  it('returns false for null', () => {
    expect(isString(null)).toBe(false)
  })
  it('returns false for undefined', () => {
    expect(isString(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// notBlank
// ---------------------------------------------------------------------------
describe('notBlank', () => {
  it('returns true for a non-empty string', () => {
    expect(notBlank('hello')).toBeTruthy()
  })
  it('returns false for an empty string', () => {
    expect(notBlank('')).toBeFalsy()
  })
  it('returns false for a whitespace-only string', () => {
    expect(notBlank('   ')).toBeFalsy()
  })
  it('returns false for undefined', () => {
    expect(notBlank(undefined)).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// arrayUnique
// ---------------------------------------------------------------------------
describe('arrayUnique', () => {
  it('removes duplicate strings', () => {
    expect(arrayUnique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('removes duplicate numbers', () => {
    expect(arrayUnique([1, 2, 1, 3])).toEqual([1, 2, 3])
  })
  it('returns same array when all unique', () => {
    expect(arrayUnique([1, 2, 3])).toEqual([1, 2, 3])
  })
  it('handles empty array', () => {
    expect(arrayUnique([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// regexEscape
// ---------------------------------------------------------------------------
describe('regexEscape', () => {
  it('escapes dots', () => {
    expect(regexEscape('example.com')).toBe('example\\.com')
  })
  it('escapes parentheses', () => {
    expect(regexEscape('foo(bar)')).toBe('foo\\(bar\\)')
  })
  it('escapes question marks', () => {
    expect(regexEscape('what?')).toBe('what\\?')
  })
  it('escapes plus signs', () => {
    expect(regexEscape('a+b')).toBe('a\\+b')
  })
  it('leaves alphanumeric characters unchanged', () => {
    expect(regexEscape('abc123')).toBe('abc123')
  })
  it('allows safe use of result in a RegExp', () => {
    const escaped = regexEscape('f.o')
    const re = new RegExp(`^${escaped}$`)
    expect(re.test('f.o')).toBe(true)
    expect(re.test('foo')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
describe('sleep', () => {
  it('resolves after roughly the specified ms', async () => {
    const start = Date.now()
    await sleep(50)
    expect(Date.now() - start).toBeGreaterThanOrEqual(40)
  })
  it('resolves immediately for negative values', async () => {
    const start = Date.now()
    await sleep(-100)
    expect(Date.now() - start).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// timeAgo  — RED: these will fail until timeAgo is implemented in utils.ts
// ---------------------------------------------------------------------------
describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const now = new Date('2024-06-01T12:00:00Z')

  function dateSecondsAgo(secs: number) {
    return new Date(now.getTime() - secs * 1000)
  }

  function withFakeNow(fn: () => void) {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    fn()
    vi.useRealTimers()
  }

  it('returns "just now" for dates less than 45 seconds ago', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(10))).toBe('just now')
      expect(timeAgo(dateSecondsAgo(44))).toBe('just now')
    })
  })

  it('returns "a minute ago" for 45-89 seconds', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(45))).toBe('a minute ago')
      expect(timeAgo(dateSecondsAgo(89))).toBe('a minute ago')
    })
  })

  it('returns "X minutes ago" for 90 seconds up to 44 minutes', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(90))).toBe('2 minutes ago')
      expect(timeAgo(dateSecondsAgo(5 * 60))).toBe('5 minutes ago')
      expect(timeAgo(dateSecondsAgo(44 * 60))).toBe('44 minutes ago')
    })
  })

  it('returns "an hour ago" for 45-89 minutes', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(45 * 60))).toBe('an hour ago')
      expect(timeAgo(dateSecondsAgo(89 * 60))).toBe('an hour ago')
    })
  })

  it('returns "X hours ago" for 90 minutes up to 21 hours', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(90 * 60))).toBe('2 hours ago')
      expect(timeAgo(dateSecondsAgo(5 * 3600))).toBe('5 hours ago')
      expect(timeAgo(dateSecondsAgo(21 * 3600))).toBe('21 hours ago')
    })
  })

  it('returns "a day ago" for 22-35 hours', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(22 * 3600))).toBe('a day ago')
      expect(timeAgo(dateSecondsAgo(35 * 3600))).toBe('a day ago')
    })
  })

  it('returns "X days ago" for 36 hours up to 25 days', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(36 * 3600))).toBe('2 days ago')
      expect(timeAgo(dateSecondsAgo(10 * 86400))).toBe('10 days ago')
    })
  })

  it('returns "a month ago" for 26-45 days', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(26 * 86400))).toBe('a month ago')
      expect(timeAgo(dateSecondsAgo(45 * 86400))).toBe('a month ago')
    })
  })

  it('returns "X months ago" for 46 days to 10 months', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(60 * 86400))).toBe('2 months ago')
      expect(timeAgo(dateSecondsAgo(300 * 86400))).toBe('10 months ago')
    })
  })

  it('returns "a year ago" for ~11-17 months', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(345 * 86400))).toBe('a year ago')
    })
  })

  it('returns "X years ago" for older dates', () => {
    withFakeNow(() => {
      expect(timeAgo(dateSecondsAgo(2 * 365 * 86400))).toBe('2 years ago')
    })
  })
})
