import { describe, it, expect } from 'vitest'
import { lossWindows } from '../losses.service'

describe('lossWindows', () => {
  it('período atual = 1º do mês até a âncora; base = N meses fechados antes', () => {
    const w = lossWindows('20260915', 3)
    expect(w).toMatchObject({
      currentFrom: '20260901',
      currentTo: '20260915',
      baselineFrom: '20260601',
      baselineTo: '20260831',
    })
    // 15 dias ÷ 92 dias (jun+jul+ago)
    expect(w.scale).toBeCloseTo(15 / 92, 5)
  })

  it('vira o ano ao voltar meses', () => {
    const w = lossWindows('20260210', 3)
    expect(w.baselineFrom).toBe('20251101')
    expect(w.baselineTo).toBe('20260131')
  })
})
