import { freshnessInfo, STALE_AFTER_HOURS } from '../FreshnessFooter'

describe('freshnessInfo', () => {
  const now = new Date('2026-08-23T12:00:00-03:00')

  it('dados de hoje não são stale', () => {
    const info = freshnessInfo('2026-08-23T03:12:00-03:00', now)
    expect(info?.stale).toBe(false)
    expect(info?.label).toContain('Dados calculados em')
  })

  it(`mais de ${STALE_AFTER_HOURS}h vira stale`, () => {
    expect(freshnessInfo('2026-08-21T03:00:00-03:00', now)?.stale).toBe(true)
  })

  it('sem data ou data inválida retorna null', () => {
    expect(freshnessInfo(null, now)).toBeNull()
    expect(freshnessInfo('abc', now)).toBeNull()
  })
})
