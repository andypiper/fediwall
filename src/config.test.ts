import { describe, it, expect, beforeEach } from 'vitest'
import {
  isTag,
  stripTag,
  isAccount,
  isServer,
  isLanguage,
  sanitizeConfig,
  fromQuery,
} from './config'

// ---------------------------------------------------------------------------
// isTag
// ---------------------------------------------------------------------------
describe('isTag', () => {
  it('accepts simple lowercase tags', () => {
    expect(isTag('foss')).toBeTruthy()
  })
  it('accepts tags with underscores', () => {
    expect(isTag('open_source')).toBeTruthy()
  })
  it('accepts tags with Unicode letters', () => {
    expect(isTag('café')).toBeTruthy()
  })
  it('rejects tags with spaces', () => {
    expect(isTag('hello world')).toBeFalsy()
  })
  it('rejects tags with hash symbol', () => {
    expect(isTag('#foss')).toBeFalsy()
  })
  it('rejects tags with special characters', () => {
    expect(isTag('foo@bar')).toBeFalsy()
  })
  it('rejects non-string values', () => {
    expect(isTag(42)).toBeFalsy()
    expect(isTag(null)).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// stripTag
// ---------------------------------------------------------------------------
describe('stripTag', () => {
  it('strips leading hash', () => {
    expect(stripTag('#foss')).toBe('foss')
  })
  it('returns plain tag unchanged', () => {
    expect(stripTag('foss')).toBe('foss')
  })
  it('returns null for invalid input', () => {
    expect(stripTag('!@#')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isAccount
// ---------------------------------------------------------------------------
describe('isAccount', () => {
  it('accepts unqualified usernames', () => {
    expect(isAccount('alice')).toBeTruthy()
  })
  it('accepts fully qualified handles', () => {
    expect(isAccount('alice@mastodon.social')).toBeTruthy()
  })
  it('rejects handles with invalid domain', () => {
    expect(isAccount('alice@local')).toBeFalsy()
  })
  it('rejects empty string', () => {
    expect(isAccount('')).toBeFalsy()
  })
  it('rejects leading @', () => {
    expect(isAccount('@alice')).toBeFalsy()
  })
  it('rejects non-string', () => {
    expect(isAccount(null)).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// isServer
// ---------------------------------------------------------------------------
describe('isServer', () => {
  it('accepts simple domains', () => {
    expect(isServer('mastodon.social')).toBeTruthy()
  })
  it('accepts domains with ports', () => {
    expect(isServer('mastodon.social:443')).toBeTruthy()
  })
  it('rejects bare hostnames without TLD', () => {
    expect(isServer('localhost')).toBeFalsy()
  })
  it('rejects URLs with protocol', () => {
    expect(isServer('https://mastodon.social')).toBeFalsy()
  })
  it('rejects empty string', () => {
    expect(isServer('')).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// isLanguage
// ---------------------------------------------------------------------------
describe('isLanguage', () => {
  it('accepts two-letter codes', () => {
    expect(isLanguage('en')).toBeTruthy()
    expect(isLanguage('de')).toBeTruthy()
  })
  it('rejects three-letter codes', () => {
    expect(isLanguage('eng')).toBeFalsy()
  })
  it('rejects one-letter codes', () => {
    expect(isLanguage('e')).toBeFalsy()
  })
  it('rejects codes with numbers', () => {
    expect(isLanguage('e1')).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// sanitizeConfig
// ---------------------------------------------------------------------------
describe('sanitizeConfig', () => {
  it('applies defaults for missing fields', () => {
    const cfg = sanitizeConfig({})
    expect(cfg.servers).toBeInstanceOf(Array)
    expect(cfg.interval).toBeGreaterThan(0)
    expect(typeof cfg.showText).toBe('boolean')
  })

  it('clamps interval between 1 and 600', () => {
    expect(sanitizeConfig({ interval: 0 }).interval).toBe(1)
    expect(sanitizeConfig({ interval: 9999 }).interval).toBe(600)
    expect(sanitizeConfig({ interval: 30 }).interval).toBe(30)
  })

  it('clamps limit between 1 and 100', () => {
    expect(sanitizeConfig({ limit: 0 }).limit).toBe(1)
    expect(sanitizeConfig({ limit: 200 }).limit).toBe(100)
  })

  it('deduplicates servers', () => {
    const cfg = sanitizeConfig({ servers: ['mastodon.social', 'mastodon.social'] })
    expect(cfg.servers.filter(s => s === 'mastodon.social').length).toBe(1)
  })

  it('rejects invalid servers', () => {
    const cfg = sanitizeConfig({ servers: ['not-a-server', 'mastodon.social'] })
    expect(cfg.servers).not.toContain('not-a-server')
    expect(cfg.servers).toContain('mastodon.social')
  })

  it('rejects invalid language codes', () => {
    const cfg = sanitizeConfig({ languages: ['en', 'xyz', '12'] })
    expect(cfg.languages).toContain('en')
    expect(cfg.languages).not.toContain('xyz')
    expect(cfg.languages).not.toContain('12')
  })

  it('forces showText=true when both showText and showMedia are false', () => {
    const cfg = sanitizeConfig({ showText: false, showMedia: false })
    expect(cfg.showText).toBe(true)
  })

  it('falls back to auto theme for invalid theme values', () => {
    const cfg = sanitizeConfig({ theme: 'purple' })
    expect(['dark', 'light', 'auto']).toContain(cfg.theme)
  })
})

// ---------------------------------------------------------------------------
// fromQuery
// ---------------------------------------------------------------------------
describe('fromQuery', () => {
  it('parses servers from query string', () => {
    const cfg = fromQuery('servers=mastodon.social,fosstodon.org')
    expect(cfg.servers).toContain('mastodon.social')
    expect(cfg.servers).toContain('fosstodon.org')
  })

  it('parses tags', () => {
    const cfg = fromQuery('tags=foss,cats')
    expect(cfg.tags).toContain('foss')
    expect(cfg.tags).toContain('cats')
  })

  it('strips leading hash from tags', () => {
    const cfg = fromQuery('tags=%23foss')
    expect(cfg.tags).toContain('foss')
  })

  it('parses hide flags', () => {
    const cfg = fromQuery('hide=nsfw,boosts,replies,bots')
    expect(cfg.hideSensitive).toBe(true)
    expect(cfg.hideBoosts).toBe(true)
    expect(cfg.hideReplies).toBe(true)
    expect(cfg.hideBots).toBe(true)
  })

  it('parses theme', () => {
    const cfg = fromQuery('theme=dark')
    expect(cfg.theme).toBe('dark')
  })

  it('handles empty query string with defaults', () => {
    const cfg = fromQuery('')
    expect(cfg.servers).toBeInstanceOf(Array)
    expect(cfg.theme).toMatch(/dark|light|auto/)
  })

  it('handles legacy "server" parameter', () => {
    const cfg = fromQuery('server=mastodon.social')
    expect(cfg.servers).toContain('mastodon.social')
  })
})
