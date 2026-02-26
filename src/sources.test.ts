import { describe, it, expect, vi } from 'vitest'
import { filterStatus, buildBadWordRegex, DOMAIN_TIMEOUT_MS } from './sources'
import type { Config } from './types'

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

const baseConfig: Config = {
  servers: ['mastodon.social'],
  tags: [],
  accounts: [],
  loadPublic: false,
  loadFederated: false,
  loadTrends: false,
  languages: [],
  badWords: [],
  hideSensitive: false,
  hideBoosts: false,
  hideReplies: false,
  hideBots: false,
  limit: 20,
  interval: 10,
  title: 'Test',
  theme: 'auto',
  showInfobar: true,
  showText: true,
  showMedia: true,
  playVideos: false,
}

function makeStatus(overrides: any = {}) {
  return {
    id: 'status-1',
    uri: 'https://mastodon.social/statuses/1',
    url: 'https://mastodon.social/@test/1',
    created_at: new Date().toISOString(),
    content: '<p>Hello world</p>',
    emojis: [],
    tags: [],
    media_attachments: [],
    sensitive: false,
    spoiler_text: '',
    visibility: 'public' as const,
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    language: 'en',
    account: {
      id: 'acc-1',
      username: 'testuser',
      acct: 'testuser@mastodon.social',
      display_name: 'Test User',
      bot: false,
      suspended: false,
      limited: false,
      locked: false,
      created_at: '2020-01-01T00:00:00Z',
      emojis: [],
      url: 'https://mastodon.social/@test',
      avatar: 'https://mastodon.social/avatar.png',
      avatar_static: 'https://mastodon.social/avatar.png',
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// DOMAIN_TIMEOUT_MS — RED until constant is exported
// ---------------------------------------------------------------------------
describe('DOMAIN_TIMEOUT_MS', () => {
  it('is exported as a positive number', () => {
    expect(typeof DOMAIN_TIMEOUT_MS).toBe('number')
    expect(DOMAIN_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('is at least 5 seconds (enough for slow servers)', () => {
    expect(DOMAIN_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000)
  })
})

// ---------------------------------------------------------------------------
// filterStatus — correctness
// ---------------------------------------------------------------------------
describe('filterStatus', () => {
  it('accepts a basic public status', () => {
    expect(filterStatus(baseConfig, makeStatus())).toBe(true)
  })

  it('rejects non-public statuses', () => {
    expect(filterStatus(baseConfig, makeStatus({ visibility: 'private' }))).toBe(false)
    expect(filterStatus(baseConfig, makeStatus({ visibility: 'unlisted' }))).toBe(false)
    expect(filterStatus(baseConfig, makeStatus({ visibility: 'direct' }))).toBe(false)
  })

  it('rejects suspended accounts', () => {
    const status = makeStatus()
    status.account.suspended = true
    expect(filterStatus(baseConfig, status)).toBe(false)
  })

  it('rejects limited accounts', () => {
    const status = makeStatus()
    status.account.limited = true
    expect(filterStatus(baseConfig, status)).toBe(false)
  })

  it('rejects sensitive posts when hideSensitive=true', () => {
    const cfg = { ...baseConfig, hideSensitive: true }
    expect(filterStatus(cfg, makeStatus({ sensitive: true }))).toBe(false)
    expect(filterStatus(cfg, makeStatus({ sensitive: false }))).toBe(true)
  })

  it('allows sensitive posts when hideSensitive=false', () => {
    const cfg = { ...baseConfig, hideSensitive: false }
    expect(filterStatus(cfg, makeStatus({ sensitive: true }))).toBe(true)
  })

  it('rejects replies when hideReplies=true', () => {
    const cfg = { ...baseConfig, hideReplies: true }
    expect(filterStatus(cfg, makeStatus({ in_reply_to_id: 'other-post' }))).toBe(false)
    expect(filterStatus(cfg, makeStatus({ in_reply_to_id: null }))).toBe(true)
  })

  it('rejects bots when hideBots=true', () => {
    const cfg = { ...baseConfig, hideBots: true }
    const status = makeStatus()
    status.account.bot = true
    expect(filterStatus(cfg, status)).toBe(false)
  })

  it('filters by language when configured', () => {
    const cfg = { ...baseConfig, languages: ['de'] }
    expect(filterStatus(cfg, makeStatus({ language: 'en' }))).toBe(false)
    expect(filterStatus(cfg, makeStatus({ language: 'de' }))).toBe(true)
  })

  it('skips boosts when hideBoosts=true', () => {
    const cfg = { ...baseConfig, hideBoosts: true }
    const status = makeStatus({ reblog: makeStatus() })
    expect(filterStatus(cfg, status)).toBe(false)
  })

  it('unwraps boosts and applies filters to the original post', () => {
    const cfg = { ...baseConfig, hideBoosts: false, hideSensitive: true }
    const originalSensitive = makeStatus({ sensitive: true })
    const boost = makeStatus({ reblog: originalSensitive })
    expect(filterStatus(cfg, boost)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterStatus — bad word filtering
// ---------------------------------------------------------------------------
describe('filterStatus bad word filtering', () => {
  it('rejects posts containing a bad word', () => {
    const cfg = { ...baseConfig, badWords: ['spam'] }
    expect(filterStatus(cfg, makeStatus({ content: '<p>This is spam</p>' }))).toBe(false)
  })

  it('accepts posts not containing any bad word', () => {
    const cfg = { ...baseConfig, badWords: ['spam'] }
    expect(filterStatus(cfg, makeStatus({ content: '<p>Hello world</p>' }))).toBe(true)
  })

  it('performs whole-word matching (does not match partial words)', () => {
    const cfg = { ...baseConfig, badWords: ['ass'] }
    expect(filterStatus(cfg, makeStatus({ content: '<p>class is great</p>' }))).toBe(true)
    expect(filterStatus(cfg, makeStatus({ content: '<p>what an ass</p>' }))).toBe(false)
  })

  it('is case-insensitive', () => {
    const cfg = { ...baseConfig, badWords: ['spam'] }
    expect(filterStatus(cfg, makeStatus({ content: '<p>SPAM everywhere</p>' }))).toBe(false)
  })

  it('matches bad words in the display name', () => {
    const cfg = { ...baseConfig, badWords: ['spammer'] }
    const status = makeStatus()
    status.account.display_name = 'I am a spammer'
    expect(filterStatus(cfg, status)).toBe(false)
  })

  it('matches bad words in spoiler text', () => {
    const cfg = { ...baseConfig, badWords: ['adult'] }
    expect(filterStatus(cfg, makeStatus({ spoiler_text: 'adult content' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildBadWordRegex — RED: this will fail until the function is exported
// ---------------------------------------------------------------------------
describe('buildBadWordRegex', () => {
  it('is exported from sources (required for caching tests)', () => {
    expect(typeof buildBadWordRegex).toBe('function')
  })

  it('returns a RegExp', () => {
    const re = buildBadWordRegex(['spam', 'foo'])
    expect(re).toBeInstanceOf(RegExp)
  })

  it('returns the same RegExp instance for the same words (cache hit)', () => {
    const re1 = buildBadWordRegex(['spam', 'foo'])
    const re2 = buildBadWordRegex(['spam', 'foo'])
    expect(re1).toBe(re2)
  })

  it('returns a different instance for different words (cache miss)', () => {
    const re1 = buildBadWordRegex(['spam'])
    const re2 = buildBadWordRegex(['ham'])
    expect(re1).not.toBe(re2)
  })

  it('correctly matches words', () => {
    const re = buildBadWordRegex(['spam', 'foo'])
    expect(re.test('this is spam')).toBe(true)
    expect(re.test('foo bar')).toBe(true)
    expect(re.test('hello world')).toBe(false)
  })

  it('escapes special regex characters so the regex does not throw', () => {
    // Words with special chars (e.g. "c++") compile safely.
    // Note: \b word-boundaries don't straddle non-word chars like "+",
    // so whole-word matching is a best-effort for standard words.
    const re = buildBadWordRegex(['c++', 'f.o', 'a(b)'])
    expect(() => re.test('test c++ language')).not.toThrow()
    expect(() => re.test('f.o bar')).not.toThrow()
  })
})
