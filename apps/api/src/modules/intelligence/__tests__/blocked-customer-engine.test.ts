// Plano 010, passo 5: com o sync gravando bloqueio só em msblql (active segue
// true), o motor passa a enxergar o cliente bloqueado no cadastro e o marca
// BLOCKED, no fim do plano (seção "Resolver") — sem mudança em engine/.
// O mock do customer.findMany aplica o filtro `active` de verdade: é ele que
// escondia o bloqueado enquanto o sync gravava active=false.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { runEngine } from '../engine/engine.service'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const REASON = 'Bloqueado no cadastro (MSBLQL)'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

function customer(code: string, overrides: { active: boolean; msblql: string | null }) {
  return {
    companyId: COMPANY,
    protheusCode: code,
    loja: '01',
    name: `Cliente ${code}`,
    vendorCode: 'V1',
    ultcom: null,
    creditLimit: null,
    segment: null,
    municipio: 'Campinas',
    bairro: null,
    ...overrides,
  }
}

const CUSTOMERS = [
  customer('A', { active: true, msblql: '2' }),
  // Bloqueado no Protheus, como o sync grava agora: ativo, com msblql='1'
  customer('B', { active: true, msblql: '1' }),
  // Excluído (ou bloqueado gravado pelo sync antigo): fica fora do motor
  customer('C', { active: false, msblql: '1' }),
]

type Row = (typeof CUSTOMERS)[number]

beforeEach(() => {
  resetPrismaMock()
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY, intelligenceEnabled: true })
  prismaMock.customer.findMany.mockImplementation(
    async (args: { where: { companyId: string; active?: boolean } }) =>
      CUSTOMERS.filter(
        (c: Row) =>
          c.companyId === args.where.companyId &&
          (args.where.active === undefined || c.active === args.where.active)
      )
  )
  // A e B compram no mesmo ciclo (~20d, último há 10d): só o cadastro separa os dois
  prismaMock.salesItem.findMany.mockResolvedValue(
    ['A', 'B'].flatMap((code) =>
      [70, 50, 30, 10].map((d, i) => ({
        orderRef: `${code}-PED${i}`,
        date: daysAgo(d),
        productCode: 'P1',
        productDesc: 'Produto 1',
        amount: 500,
        customerCode: code,
        loja: '01',
      }))
    )
  )
  prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V1', visitsPerDay: 5 }])
  prismaMock.goalSnapshot.findFirst.mockResolvedValue({ goalAmount: 10_000, soldAmount: 4_000 })
  prismaMock.visitPlan.create.mockResolvedValue({ id: 'plan-1' })
})

describe('motor com cliente bloqueado no cadastro (plano 010)', () => {
  it('msblql=1 e active=true → BLOCKED com o motivo do cadastro', async () => {
    await runEngine(COMPANY, 'run-010')

    const signalRows = prismaMock.customerSignal.createMany.mock.calls[0][0].data
    const byCode = new Map(
      signalRows.map((r: { customerCode: string }) => [r.customerCode, r])
    ) as Map<string, { status: string; reasons: string[] }>
    expect([...byCode.keys()].sort()).toEqual(['A', 'B'])
    expect(byCode.get('A')?.status).toBe('ON_CYCLE')
    expect(byCode.get('B')?.status).toBe('BLOCKED')
    expect(byCode.get('B')?.reasons).toContain(REASON)
  })

  it('bloqueado entra no fim do plano do dia (seção "Resolver")', async () => {
    await runEngine(COMPANY, 'run-010')

    const items = prismaMock.visitPlan.create.mock.calls[0][0].data.items.create as Array<{
      customerCode: string
      statusAtTime: string
      signalsSnapshot: { reasons: string[] }
    }>
    expect(items.map((i) => i.customerCode)).toEqual(['A', 'B'])
    const last = items[items.length - 1]
    expect(last.statusAtTime).toBe('BLOCKED')
    expect(last.signalsSnapshot.reasons).toContain(REASON)
  })

  it('cliente com active=false não chega ao motor', async () => {
    await runEngine(COMPANY, 'run-010')

    const items = prismaMock.visitPlan.create.mock.calls[0][0].data.items.create
    expect(items.some((i: { customerCode: string }) => i.customerCode === 'C')).toBe(false)
  })
})
