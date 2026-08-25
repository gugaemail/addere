import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { runEngine } from '../engine.service'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

function baseMocks() {
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY, intelligenceEnabled: true })
  prismaMock.customer.findMany.mockResolvedValue([
    {
      protheusCode: 'A',
      loja: '01',
      name: 'Cliente A',
      vendorCode: 'V1',
      msblql: null,
      ultcom: null,
      creditLimit: null,
      segment: null,
      municipio: 'Campinas',
      bairro: null,
    },
    {
      protheusCode: 'B',
      loja: '01',
      name: 'Cliente B (bloqueado)',
      vendorCode: 'V1',
      msblql: '1',
      ultcom: daysAgo(30),
      creditLimit: null,
      segment: null,
      municipio: 'Campinas',
      bairro: null,
    },
  ])
  // 4 pedidos do cliente A, ciclo ~20d, último há 10d
  prismaMock.salesItem.findMany.mockResolvedValue(
    [70, 50, 30, 10].map((d, i) => ({
      orderRef: `PED${i}`,
      date: daysAgo(d),
      productCode: 'P1',
      productDesc: 'Produto 1',
      amount: 500,
      customerCode: 'A',
      loja: '01',
    }))
  )
  prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V1', visitsPerDay: 5 }])
  prismaMock.goalSnapshot.findFirst.mockResolvedValue({ goalAmount: 10_000, soldAmount: 4_000 })
  prismaMock.visitPlan.create.mockResolvedValue({ id: 'plan-1' })
}

describe('runEngine (E5)', () => {
  beforeEach(() => {
    resetPrismaMock()
    baseMocks()
  })

  it('grava sinais + plano do dia com bloqueado ao final', async () => {
    const summary = await runEngine(COMPANY, 'run-1')

    expect(summary).toMatchObject({ customers: 2, signals: 2, sellers: 1, plansCreated: 1, plansSkipped: 0 })

    // Plano: A (no ciclo) primeiro, B (bloqueado) na seção final
    const planArgs = prismaMock.visitPlan.create.mock.calls[0][0]
    const items = planArgs.data.items.create
    expect(items.map((i: { customerCode: string }) => i.customerCode)).toEqual(['A', 'B'])
    expect(items[0].statusAtTime).toBe('ON_CYCLE')
    expect(items[0].signalsSnapshot.reasons.length).toBeGreaterThan(0)
    expect(items[1].statusAtTime).toBe('BLOCKED')
    expect(planArgs.data.goalGap).toBe(6_000)
    expect(planArgs.data.grouping).toBe('Campinas')
    expect(planArgs.data.status).toBe('GENERATED')

    // Sinais: replace por tenant em transação
    expect(prismaMock.customerSignal.deleteMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY },
    })
    const signalRows = prismaMock.customerSignal.createMany.mock.calls[0][0].data
    expect(signalRows).toHaveLength(2)
    const a = signalRows.find((r: { customerCode: string }) => r.customerCode === 'A')
    expect(a.status).toBe('ON_CYCLE')
    expect(a.cycleDays).toBe(20)
    expect(a.scoreTotal).not.toBeNull()
  })

  it('não sobrescreve plano EDITED do dia', async () => {
    prismaMock.visitPlan.findUnique.mockResolvedValue({ id: 'plan-x', status: 'EDITED' })
    const summary = await runEngine(COMPANY, 'run-2')
    expect(summary.plansSkipped).toBe(1)
    expect(summary.plansCreated).toBe(0)
    expect(prismaMock.visitPlan.create).not.toHaveBeenCalled()
    expect(prismaMock.visitPlan.delete).not.toHaveBeenCalled()
  })

  it('plano GENERATED existente é substituído (delete + create)', async () => {
    prismaMock.visitPlan.findUnique.mockResolvedValue({ id: 'plan-old', status: 'GENERATED' })
    const summary = await runEngine(COMPANY, 'run-3')
    expect(prismaMock.visitPlan.delete).toHaveBeenCalledWith({ where: { id: 'plan-old' } })
    expect(summary.plansCreated).toBe(1)
  })

  it('empresa com camada desligada → erro claro', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY, intelligenceEnabled: false })
    await expect(runEngine(COMPANY, 'run-4')).rejects.toThrow(/desligada/)
  })
})
