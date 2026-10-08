import { remoteCheckInPayload, resultOptions, visitMarksByItem } from '../remoteVisit'

describe('remoteCheckInPayload', () => {
  it('REMOTE, sem posição e sem canal (o canal vem na conclusão)', () => {
    expect(
      remoteCheckInPayload({ id: 'item-1', customerCode: 'C1', loja: '01' }, 'uuid-1', '2026-10-08T15:00:00.000Z')
    ).toEqual({
      clientId: 'uuid-1',
      planItemId: 'item-1',
      customerCode: 'C1',
      loja: '01',
      arrivedAt: '2026-10-08T15:00:00.000Z',
      lat: null,
      lng: null,
      accuracyM: null,
      source: 'REMOTE',
      channel: null,
    })
  })
})

describe('resultOptions', () => {
  it('presencial mantém "Não estava"; à distância vira "Não atendeu"', () => {
    expect(resultOptions(false).find((r) => r.key === 'NOT_FOUND')?.label).toBe('Não estava')
    expect(resultOptions(true).find((r) => r.key === 'NOT_FOUND')?.label).toBe('Não atendeu')
    expect(resultOptions(true).map((r) => r.key)).toEqual(['ORDER', 'NO_ORDER', 'NOT_FOUND', 'RESCHEDULED'])
  })
})

describe('visitMarksByItem', () => {
  const visit = (planItemId: string | null, source?: string) => ({
    type: 'visit',
    payload: { planItemId, source },
  })

  it('remoto vira "remote"; presencial (sem source = CHECKIN) vira "visited"', () => {
    const marks = visitMarksByItem([visit('a', 'REMOTE'), visit('b'), visit('c', 'CHECKIN')])
    expect(marks.get('a')).toBe('remote')
    expect(marks.get('b')).toBe('visited')
    expect(marks.get('c')).toBe('visited')
  })

  it('ligou e depois foi lá: presencial vence, em qualquer ordem', () => {
    expect(visitMarksByItem([visit('a', 'REMOTE'), visit('a', 'CHECKIN')]).get('a')).toBe('visited')
    expect(visitMarksByItem([visit('a', 'CHECKIN'), visit('a', 'REMOTE')]).get('a')).toBe('visited')
  })

  it('ignora outras filas e visita fora do plano', () => {
    const marks = visitMarksByItem([{ type: 'visitResult', payload: { planItemId: 'a' } }, visit(null, 'REMOTE')])
    expect(marks.size).toBe(0)
  })
})
