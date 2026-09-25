import { describe, expect, it } from 'vitest'
import { freshnessInfo } from '../freshness'

const NOW = new Date('2026-08-23T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

describe('freshnessInfo', () => {
  it('null/undefined → nunca', () => {
    expect(freshnessInfo(null, NOW)).toEqual({ level: 'never', label: 'nunca' })
    expect(freshnessInfo(undefined, NOW)).toEqual({ level: 'never', label: 'nunca' })
  })

  it('régua <24h fresh · 24–48h stale · >48h old', () => {
    expect(freshnessInfo(hoursAgo(0.5), NOW)).toEqual({ level: 'fresh', label: 'há menos de 1 h' })
    expect(freshnessInfo(hoursAgo(5), NOW)).toEqual({ level: 'fresh', label: 'há 5 h' })
    expect(freshnessInfo(hoursAgo(23), NOW).level).toBe('fresh')
    expect(freshnessInfo(hoursAgo(24), NOW)).toEqual({ level: 'stale', label: 'há 24 h' })
    expect(freshnessInfo(hoursAgo(47), NOW).level).toBe('stale')
    expect(freshnessInfo(hoursAgo(49), NOW)).toEqual({ level: 'old', label: 'há 2 d' })
    expect(freshnessInfo(hoursAgo(24 * 10), NOW)).toEqual({ level: 'old', label: 'há 10 d' })
  })

  it('data inválida ou no futuro → nunca', () => {
    expect(freshnessInfo('não-é-data', NOW).level).toBe('never')
    expect(freshnessInfo(hoursAgo(-2), NOW).level).toBe('never')
  })
})
