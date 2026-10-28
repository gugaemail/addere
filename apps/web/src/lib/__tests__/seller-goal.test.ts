import { describe, expect, it } from 'vitest'
import type { TeamSellerGoal } from '@/hooks/useIntel'
import { sellerGoalView } from '../seller-goal'

const goal = (over: Partial<TeamSellerGoal> = {}): TeamSellerGoal => ({
  period: '202610',
  goalAmount: '150000.00',
  soldAmount: '120000.00',
  gap: '30000.00',
  pct: 80,
  capturedAt: '2026-10-28T19:53:00.000Z',
  ...over,
})

describe('sellerGoalView', () => {
  it('em andamento: meta, vendido e quanto falta, com o mês no título', () => {
    const view = sellerGoalView(goal())
    expect(view.title).toBe('Meta de outubro')
    expect(view.pctLabel).toBe('80%')
    expect(view.barPct).toBe(80)
    expect(view.reached).toBe(false)
    expect(view.line).toMatch(
      /^Vendido R\$\s120\.000,00 de R\$\s150\.000,00 · faltam R\$\s30\.000,00$/
    )
  })

  it('meta batida mostra o valor da meta e o percentual real; a barra para em 100', () => {
    const view = sellerGoalView(goal({ soldAmount: '175958.62', gap: '0.00', pct: 117 }))
    expect(view.pctLabel).toBe('117%')
    expect(view.barPct).toBe(100)
    expect(view.reached).toBe(true)
    expect(view.line).toContain('de R$')
    expect(view.line).toContain('150.000,00')
    expect(view.line).toContain('meta batida')
  })

  it('diz quando a meta foi capturada, no horário de Brasília', () => {
    // 19:53 UTC = 16:53 em São Paulo
    expect(sellerGoalView(goal()).capturedLabel).toBe('Capturada em 28/10 às 16:53')
  })

  it('sem captura no mês: avisa em vez de mostrar zero', () => {
    const view = sellerGoalView(null)
    expect(view.line).toBe('Sem meta capturada neste mês')
    expect(view.pctLabel).toBeNull()
    expect(view.capturedLabel).toBeNull()
  })

  it('captura sem meta (ou meta zerada) não vira 0% nem "meta batida"', () => {
    for (const goalAmount of [null, '0.00']) {
      const view = sellerGoalView(goal({ goalAmount, gap: null, pct: null }))
      expect(view.pctLabel, String(goalAmount)).toBeNull()
      expect(view.line).toContain('Sem meta cadastrada no Protheus')
      expect(view.line).toContain('120.000,00')
    }
  })
})
