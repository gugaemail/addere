// Meta da equipe (home do gerente no app) sobre fixtures — nada toca o banco.
import { describe, expect, it } from 'vitest'
import { buildTeamGoal } from '../team-goal'

const ana = { userId: 'u1', name: 'Ana', vendorCode: 'V1' }
const bia = { userId: 'u2', name: 'Bia', vendorCode: 'V2' }
const snap = (vendorCode: string, goalAmount: number | null, soldAmount: number | null, day = 1) => ({
  vendorCode,
  goalAmount,
  soldAmount,
  capturedAt: new Date(Date.UTC(2026, 7, day)),
})

describe('buildTeamGoal', () => {
  it('soma as metas e o vendido dos vendedores da equipe', () => {
    const goal = buildTeamGoal([ana, bia], [snap('V1', 1000, 250), snap('V2', 3000, 1750)])
    expect(goal.goalAmount).toBe('4000.00')
    expect(goal.soldAmount).toBe('2000.00')
    expect(goal.gap).toBe('2000.00')
    expect(goal.pct).toBe(50)
    expect(goal.sellersWithGoal).toBe(2)
    expect(goal.sellers.map((s) => s.pct)).toEqual([25, 58])
  })

  it('usa o snapshot mais recente de cada vendedor', () => {
    const goal = buildTeamGoal([ana], [snap('V1', 1000, 100, 1), snap('V1', 1000, 900, 20)])
    expect(goal.soldAmount).toBe('900.00')
    expect(goal.pct).toBe(90)
  })

  it('vendedor sem meta capturada entra na lista sem número e não zera a soma', () => {
    const goal = buildTeamGoal([ana, bia], [snap('V1', 1000, 400)])
    expect(goal.sellers[1]).toMatchObject({ name: 'Bia', goalAmount: null, soldAmount: null, pct: null })
    expect(goal.goalAmount).toBe('1000.00')
    expect(goal.sellersWithGoal).toBe(1)
  })

  it('sem nenhuma meta no mês, tudo é nulo — o card não aparece', () => {
    const goal = buildTeamGoal([ana], [])
    expect(goal).toMatchObject({ goalAmount: null, soldAmount: null, gap: null, pct: null, sellersWithGoal: 0 })
  })

  it('meta batida não passa de 100% e o gap não fica negativo', () => {
    const goal = buildTeamGoal([ana], [snap('V1', 1000, 1500)])
    expect(goal.pct).toBe(100)
    expect(goal.gap).toBe('0.00')
  })
})
