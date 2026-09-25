// Seleção dos casos do eval (E14a) — a suíte precisa cobrir os status, não
// repetir o mais numeroso.
import { describe, expect, it } from 'vitest'
import { selectEvalCases, type SelectableSignal } from '../select-cases'

const sig = (status: string, customerCode: string, hasCutMix = false): SelectableSignal => ({
  status,
  customerCode,
  loja: '01',
  hasCutMix,
})

describe('selectEvalCases', () => {
  it('faz rodízio entre os status em vez de esvaziar o primeiro', () => {
    const signals = [
      ...Array.from({ length: 10 }, (_, i) => sig('NEW', `N${i}`)),
      ...Array.from({ length: 10 }, (_, i) => sig('LATE', `L${i}`)),
      ...Array.from({ length: 10 }, (_, i) => sig('AT_RISK', `R${i}`)),
    ]
    const selected = selectEvalCases(signals, 6)
    expect(selected.map((s) => s.status)).toEqual([
      'NEW',
      'LATE',
      'AT_RISK',
      'NEW',
      'LATE',
      'AT_RISK',
    ])
  })

  it('status escasso não trava os demais — os outros completam a cota', () => {
    // Espelha o banco real: muitos NEW, dois BLOCKED
    const signals = [
      ...Array.from({ length: 41 }, (_, i) => sig('NEW', `N${String(i).padStart(2, '0')}`)),
      sig('BLOCKED', 'B0'),
      sig('BLOCKED', 'B1'),
    ]
    const selected = selectEvalCases(signals, 20)
    expect(selected).toHaveLength(20)
    expect(selected.filter((s) => s.status === 'BLOCKED')).toHaveLength(2)
    expect(selected.filter((s) => s.status === 'NEW')).toHaveLength(18)
  })

  it('caso com mix cortado entra antes — exercita mais do prompt', () => {
    const signals = [sig('NEW', 'A'), sig('NEW', 'B', true), sig('NEW', 'C')]
    expect(selectEvalCases(signals, 1).map((s) => s.customerCode)).toEqual(['B'])
  })

  it('é determinístico: congelar duas vezes dá a mesma suíte', () => {
    const signals = [sig('LATE', 'L2'), sig('NEW', 'N1'), sig('LATE', 'L1'), sig('NEW', 'N2', true)]
    const key = (s: SelectableSignal) => `${s.status}:${s.customerCode}`
    expect(selectEvalCases(signals, 4).map(key)).toEqual(selectEvalCases(signals, 4).map(key))
    expect(selectEvalCases(signals, 2).map(key)).toEqual(['LATE:L1', 'NEW:N2'])
  })

  it('devolve tudo quando há menos sinais que a cota', () => {
    expect(selectEvalCases([sig('NEW', 'A'), sig('LATE', 'B')], 20)).toHaveLength(2)
  })

  it('base vazia ou cota zero não quebra', () => {
    expect(selectEvalCases([], 20)).toEqual([])
    expect(selectEvalCases([sig('NEW', 'A')], 0)).toEqual([])
  })
})
