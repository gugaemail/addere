// O gerador de faturas (plano 016, passo 5). O mock do Prisma não aplica
// `where`: os testes conferem a forma da consulta E a checagem em código
// (isCompetenceBillable), que segura o contrato que uma consulta errada
// deixasse passar. Horários em UTC; São Paulo é UTC−3.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../lib/sentry', () => ({ captureError: captureMock }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { generateInvoices } from '../invoices.service'

const date = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)

interface TermsOpts {
  id?: string
  effectiveFrom: string
  packagePrice?: string
  extraSeats?: number
  extraSeatPrice?: string
  version?: number
  origin?: string
}

function terms(o: TermsOpts) {
  return {
    id: o.id ?? `terms-${o.version ?? 1}`,
    status: 'EFFECTIVE',
    origin: o.origin ?? 'CONTRACT',
    effectiveFrom: new Date(o.effectiveFrom),
    version: o.version ?? 1,
    licenseType: 'INTELLIGENCE',
    includedSeats: 20,
    extraSeats: o.extraSeats ?? 0,
    packagePrice: new Prisma.Decimal(o.packagePrice ?? '1990.00'),
    extraSeatPrice: new Prisma.Decimal(o.extraSeatPrice ?? '49.90'),
    package: { name: 'Pacote 20' },
  }
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contract-1',
    companyId: 'company-1',
    status: 'ACTIVE',
    firstBilledCompetence: date('2026-09-01'),
    endsAt: null,
    dueDay: 10,
    terms: [terms({ effectiveFrom: '2026-08-03T15:00:00Z' })],
    ...overrides,
  }
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '5.22.0' })

let nextNumber = 100

beforeEach(() => {
  resetPrismaMock()
  captureMock.mockReset()
  nextNumber = 100
  prismaMock.invoice.create.mockImplementation(async () => ({
    id: `inv-${nextNumber}`,
    number: nextNumber++,
  }))
})

const createdData = (i = 0) => prismaMock.invoice.create.mock.calls[i][0].data

describe('consulta do gerador', () => {
  it('01/11 à 0h30 em São Paulo: competência outubro, com o OR de status', async () => {
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    const where = prismaMock.companyContract.findMany.mock.calls[0][0].where
    expect(where).toEqual({
      firstBilledCompetence: { lte: date('2026-10-01') },
      OR: [
        { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gte: date('2026-10-01') } }] },
        { status: 'CANCELLED', endsAt: { gte: date('2026-10-01'), lte: date('2026-10-31') } },
      ],
    })
  })

  it('31/10 às 22h em São Paulo (01/11 01h UTC): ainda fatura setembro', async () => {
    const summary = await generateInvoices(new Date('2026-11-01T01:00:00Z'))
    const where = prismaMock.companyContract.findMany.mock.calls[0][0].where
    expect(where.firstBilledCompetence).toEqual({ lte: date('2026-09-01') })
    expect(summary.competence).toBe('2026-09')
  })

  it('pede só os termos EFFECTIVE, com o pacote', async () => {
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    const select = prismaMock.companyContract.findMany.mock.calls[0][0].select
    expect(select.terms.where).toEqual({ status: 'EFFECTIVE' })
    expect(select.terms.select.package).toEqual({ select: { name: true } })
  })
})

describe('idempotência', () => {
  it('fatura existente na competência: não cria e conta em existing', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([contract()])
    prismaMock.invoice.findUnique.mockResolvedValue({ id: 'inv-old' })
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(prismaMock.invoice.findUnique.mock.calls[0][0].where).toEqual({
      companyId_competence: { companyId: 'company-1', competence: date('2026-10-01') },
    })
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ created: 0, existing: 1 })
  })

  it('P2002 no create (outro processo criou primeiro): existing, sem evento e sem lançar', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([contract()])
    prismaMock.invoice.create.mockRejectedValue(p2002())
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(summary).toMatchObject({ created: 0, existing: 1, failed: 0 })
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('a fatura nasce com o evento INVOICE_GENERATED, autor null, na mesma transação', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([contract()])
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toEqual({
      type: 'INVOICE_GENERATED',
      companyId: 'company-1',
      actorId: null,
      payload: { fields: [], invoiceId: 'inv-100', invoiceNumber: 100 },
    })
  })
})

describe('fronteira pós-paga: mudança no dia 15 é cobrada no mês seguinte', () => {
  for (const origin of ['AMENDMENT', 'LICENSE_REQUEST']) {
    it(`termos B (${origin}) efetivos em 15/10 entram só em novembro`, async () => {
      const both = [
        terms({ id: 'terms-a', effectiveFrom: '2026-08-03T15:00:00Z', version: 1 }),
        terms({
          id: 'terms-b',
          effectiveFrom: '2026-10-15T14:00:00Z',
          version: 2,
          extraSeats: 3,
          origin,
        }),
      ]
      prismaMock.companyContract.findMany.mockResolvedValue([contract({ terms: both })])

      await generateInvoices(new Date('2026-11-01T03:30:00Z'))
      expect(createdData(0)).toMatchObject({ termsId: 'terms-a' })
      expect(createdData(0).total.toFixed(2)).toBe('1990.00')

      await generateInvoices(new Date('2026-12-01T03:30:00Z'))
      expect(createdData(1)).toMatchObject({ termsId: 'terms-b' })
      expect(createdData(1).total.toFixed(2)).toBe('2139.70')
    })
  }

  it('termos aceitos às 22h de 30/09 em São Paulo contam para outubro', async () => {
    const both = [
      terms({ id: 'terms-a', effectiveFrom: '2026-08-03T15:00:00Z', version: 1 }),
      terms({ id: 'terms-b', effectiveFrom: '2026-10-01T01:00:00Z', version: 2, extraSeats: 3 }),
    ]
    prismaMock.companyContract.findMany.mockResolvedValue([contract({ terms: both })])
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(createdData(0)).toMatchObject({ termsId: 'terms-b' })
  })

  it('termos das 00:00 de 01/10 em São Paulo ficam para novembro', async () => {
    const both = [
      terms({ id: 'terms-a', effectiveFrom: '2026-08-03T15:00:00Z', version: 1 }),
      terms({ id: 'terms-b', effectiveFrom: '2026-10-01T03:00:00Z', version: 2, extraSeats: 3 }),
    ]
    prismaMock.companyContract.findMany.mockResolvedValue([contract({ terms: both })])
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(createdData(0)).toMatchObject({ termsId: 'terms-a' })
  })
})

describe('checagem dupla: o que a regra recusa nunca vira fatura', () => {
  it('mês do cancelamento cobrado; o seguinte não, mesmo com a consulta errada', async () => {
    const cancelled = contract({ status: 'CANCELLED', endsAt: date('2026-10-31') })
    prismaMock.companyContract.findMany.mockResolvedValue([cancelled])

    const october = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(october.created).toBe(1)
    expect(day(createdData(0).competence)).toBe('2026-10-01')

    prismaMock.invoice.create.mockClear()
    const november = await generateInvoices(new Date('2026-12-01T03:30:00Z'))
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(november).toMatchObject({ created: 0, skipped: 1 })
    expect(captureMock).toHaveBeenCalled()
  })

  it('carência: firstBilledCompetence em janeiro, gerando dezembro → nada', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ firstBilledCompetence: date('2027-01-01') }),
    ])
    const summary = await generateInvoices(new Date('2027-01-01T03:30:00Z'))
    expect(summary.competence).toBe('2026-12')
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
    expect(captureMock).toHaveBeenCalled()
  })

  it('DRAFT e PENDING_ACCEPTANCE → nada', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ status: 'DRAFT', companyId: 'company-1' }),
      contract({ status: 'PENDING_ACCEPTANCE', companyId: 'company-2' }),
    ])
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(prismaMock.invoice.findUnique).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ created: 0, skipped: 2 })
  })

  it('contrato cobrável sem termos efetivos na competência → nada, e vai ao Sentry', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ terms: [terms({ effectiveFrom: '2026-10-20T12:00:00Z' })] }),
    ])
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})

describe('a fatura criada', () => {
  it('dueDay 1 e 10: vence em 01/11 e 10/11', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ companyId: 'company-1', dueDay: 1 }),
      contract({ companyId: 'company-2', dueDay: 10 }),
    ])
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(day(createdData(0).dueDate)).toBe('2026-11-01')
    expect(day(createdData(1).dueDate)).toBe('2026-11-10')
  })

  it('itens PACKAGE e EXTRA_SEATS automáticos e o total em Decimal', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ terms: [terms({ effectiveFrom: '2026-08-03T15:00:00Z', extraSeats: 3 })] }),
    ])
    await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    const data = createdData(0)
    expect(data).toMatchObject({
      companyId: 'company-1',
      status: 'OPEN',
      origin: 'JOB',
      createdById: null,
    })
    expect(data.total).toBeInstanceOf(Prisma.Decimal)
    expect(data.total.toFixed(2)).toBe('2139.70')
    const items = data.items.create
    expect(items.map((i: { kind: string }) => i.kind)).toEqual(['PACKAGE', 'EXTRA_SEATS'])
    expect(items.every((i: { manual: boolean }) => i.manual === false)).toBe(true)
    expect(items[1].amount.toFixed(2)).toBe('149.70')
  })

  it('termos acima do Decimal(14,2): failed, Sentry com AMOUNT_TOO_LARGE e nenhum INSERT', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({
        terms: [
          terms({
            effectiveFrom: '2026-08-03T15:00:00Z',
            extraSeats: 10000,
            extraSeatPrice: '999999999999.99',
          }),
        ],
      }),
    ])
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(summary).toMatchObject({ created: 0, failed: 1 })
    // Sem INSERT: o número da sequência não é gasto
    expect(prismaMock.invoice.create).not.toHaveBeenCalled()
    expect(captureMock.mock.calls[0][0]).toMatchObject({ code: 'AMOUNT_TOO_LARGE' })
  })

  it('erro em um contrato não para os outros', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      contract({ companyId: 'company-1' }),
      contract({ companyId: 'company-2' }),
    ])
    prismaMock.invoice.create
      .mockRejectedValueOnce(new Error('falha qualquer'))
      .mockResolvedValueOnce({ id: 'inv-2', number: 2 })
    const summary = await generateInvoices(new Date('2026-11-01T03:30:00Z'))
    expect(summary).toMatchObject({ created: 1, failed: 1 })
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it('geração atrasada (vencimento já passou em São Paulo) vai ao Sentry', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([contract({ dueDay: 5 })])
    const summary = await generateInvoices(new Date('2026-11-12T15:00:00Z'))
    expect(summary.created).toBe(1)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })

  it('a consulta que falha é lançada para o agendador', async () => {
    prismaMock.companyContract.findMany.mockRejectedValue(new Error('banco'))
    await expect(generateInvoices(new Date('2026-11-01T03:30:00Z'))).rejects.toThrow('banco')
  })
})
