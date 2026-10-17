// Cancelamento do contrato com efeito no fim do mês (plano 016, passo 6): o
// fim é o último dia do mês do pedido em São Paulo, o encerramento acontece à
// 0h de São Paulo do dia seguinte, desliga a Inteligência e, com a opção, a
// empresa, na mesma transação. Horários em UTC; São Paulo é UTC−3.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const { clearScheduleMock, captureMock } = vi.hoisted(() => ({
  clearScheduleMock: vi.fn(),
  captureMock: vi.fn(),
}))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../lib/sentry', () => ({ captureError: captureMock, initSentry: vi.fn() }))
vi.mock('../../sync/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/scheduler')>()),
  clearSchedule: clearScheduleMock,
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { AppError } from '../../../lib/errors'
import {
  closeEndedContracts,
  revertContractCancel,
  scheduleContractCancel,
} from '../contract-cancel.service'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const date = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
const day = (d: Date) => d.toISOString().slice(0, 10)
const ACTOR = { id: 'super-1' }
const INPUT = { reason: 'Cliente pediu por e-mail', deactivateCompany: true }

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AppError)
  return err as AppError
}

function mockContract(row: Record<string, unknown> | null) {
  prismaMock.companyContract.findUnique.mockResolvedValue(
    row && { id: 'contract-1', status: 'ACTIVE', endsAt: null, ...row }
  )
}

beforeEach(() => {
  resetPrismaMock()
  clearScheduleMock.mockReset()
  captureMock.mockReset()
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
})

describe('scheduleContractCancel — o fim é o último dia do mês em São Paulo', () => {
  it('pedido em 15/10: termina em 31/10', async () => {
    mockContract({})
    const res = await scheduleContractCancel(
      COMPANY_A,
      INPUT,
      ACTOR,
      new Date('2026-10-15T15:00:00Z')
    )
    expect(res).toEqual({ endsAt: '2026-10-31' })
    const call = prismaMock.companyContract.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'contract-1', status: 'ACTIVE', endsAt: null })
    expect(day(call.data.endsAt)).toBe('2026-10-31')
    expect(call.data).toMatchObject({
      cancelRequestedById: 'super-1',
      cancelReason: 'Cliente pediu por e-mail',
      deactivateCompanyOnEnd: true,
    })
  })

  it('pedido às 22h de 31/10 em São Paulo (01/11 01h UTC): ainda termina em 31/10', async () => {
    mockContract({})
    const res = await scheduleContractCancel(
      COMPANY_A,
      INPUT,
      ACTOR,
      new Date('2026-11-01T01:00:00Z')
    )
    expect(res.endsAt).toBe('2026-10-31')
  })

  it('pedido à 0h30 de 01/11 em São Paulo: termina em 30/11', async () => {
    mockContract({})
    const res = await scheduleContractCancel(
      COMPANY_A,
      INPUT,
      ACTOR,
      new Date('2026-11-01T03:30:00Z')
    )
    expect(res.endsAt).toBe('2026-11-30')
  })

  it('cancela os documentos SENT e grava o evento só com nomes de campo', async () => {
    mockContract({})
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: 'doc-1', kind: 'AMENDMENT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    await scheduleContractCancel(COMPANY_A, INPUT, ACTOR, new Date('2026-10-15T15:00:00Z'))
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0].where).toEqual({
      contractId: 'contract-1',
      status: 'SENT',
    })
    const types = prismaMock.billingEvent.create.mock.calls.map(
      (c: Array<{ data: { type: string } }>) => c[0].data.type
    )
    expect(types).toEqual(['DOCUMENT_CANCELLED', 'CONTRACT_CANCEL_SCHEDULED'])
    const scheduled = prismaMock.billingEvent.create.mock.calls[1][0].data
    expect(scheduled).toMatchObject({ companyId: COMPANY_A, actorId: 'super-1' })
    expect(scheduled.payload).toEqual({
      fields: ['endsAt', 'cancelReason', 'deactivateCompanyOnEnd'],
    })
    expect(JSON.stringify(scheduled)).not.toContain('Cliente pediu')
  })

  it('contrato PENDING_ACCEPTANCE: 409 CONTRACT_NOT_ACTIVE', async () => {
    mockContract({ status: 'PENDING_ACCEPTANCE' })
    const err = await failure(scheduleContractCancel(COMPANY_A, INPUT, ACTOR, new Date()))
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONTRACT_NOT_ACTIVE')
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('já agendado: 409 CONTRACT_CANCEL_ALREADY_SCHEDULED', async () => {
    mockContract({ endsAt: date('2026-10-31') })
    const err = await failure(scheduleContractCancel(COMPANY_A, INPUT, ACTOR, new Date()))
    expect(err.code).toBe('CONTRACT_CANCEL_ALREADY_SCHEDULED')
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('corrida (updateMany sem linha): 409 CONTRACT_CANCEL_ALREADY_SCHEDULED, sem evento', async () => {
    mockContract({})
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 0 })
    const err = await failure(scheduleContractCancel(COMPANY_A, INPUT, ACTOR, new Date()))
    expect(err.code).toBe('CONTRACT_CANCEL_ALREADY_SCHEDULED')
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('sem contrato: 404', async () => {
    mockContract(null)
    const err = await failure(scheduleContractCancel(COMPANY_A, INPUT, ACTOR, new Date()))
    expect(err.statusCode).toBe(404)
  })
})

describe('revertContractCancel', () => {
  it('dentro do mês: limpa os cinco campos e grava o evento', async () => {
    mockContract({ endsAt: date('2026-10-31') })
    await revertContractCancel(COMPANY_A, ACTOR, new Date('2026-10-31T23:00:00Z'))
    const call = prismaMock.companyContract.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({
      id: 'contract-1',
      status: 'ACTIVE',
      endsAt: { gte: date('2026-10-31') },
    })
    expect(call.data).toEqual({
      endsAt: null,
      cancelRequestedAt: null,
      cancelRequestedById: null,
      cancelReason: null,
      deactivateCompanyOnEnd: false,
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.type).toBe(
      'CONTRACT_CANCEL_REVERTED'
    )
  })

  it('depois do fim do mês: 409 CONTRACT_CANCEL_NOT_SCHEDULED', async () => {
    mockContract({ endsAt: date('2026-10-31') })
    const err = await failure(
      revertContractCancel(COMPANY_A, ACTOR, new Date('2026-11-01T03:30:00Z'))
    )
    expect(err.code).toBe('CONTRACT_CANCEL_NOT_SCHEDULED')
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('contrato já encerrado ou sem agendamento: 409', async () => {
    mockContract({ status: 'CANCELLED', endsAt: date('2026-10-31') })
    expect((await failure(revertContractCancel(COMPANY_A, ACTOR, new Date()))).code).toBe(
      'CONTRACT_CANCEL_NOT_SCHEDULED'
    )
    mockContract({})
    expect((await failure(revertContractCancel(COMPANY_A, ACTOR, new Date()))).code).toBe(
      'CONTRACT_CANCEL_NOT_SCHEDULED'
    )
  })
})

describe('closeEndedContracts — encerramento à 0h de São Paulo', () => {
  // O mock não aplica `where`: este aplica o filtro de data, para o teste
  // provar a fronteira pela consulta que o serviço monta
  function mockEnding(row: { deactivateCompanyOnEnd: boolean }, endsAt = date('2026-10-31')) {
    prismaMock.companyContract.findMany.mockImplementation(
      async (args: { where: { status: string; endsAt: { lt: Date } } }) =>
        args.where.status === 'ACTIVE' && endsAt < args.where.endsAt.lt
          ? [{ id: 'contract-1', companyId: COMPANY_A, ...row }]
          : []
    )
  }

  it('às 23h59 de 31/10 em São Paulo não encerra', async () => {
    mockEnding({ deactivateCompanyOnEnd: false })
    await expect(closeEndedContracts(new Date('2026-11-01T02:59:00Z'))).resolves.toBe(0)
    expect(prismaMock.companyContract.findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      endsAt: { lt: date('2026-10-31') },
    })
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('à 0h de 01/11 encerra, desliga a Inteligência e grava o evento', async () => {
    mockEnding({ deactivateCompanyOnEnd: false })
    await expect(closeEndedContracts(new Date('2026-11-01T03:00:00Z'))).resolves.toBe(1)
    expect(prismaMock.companyContract.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'contract-1', status: 'ACTIVE', endsAt: { lt: date('2026-11-01') } },
      data: { status: 'CANCELLED' },
    })
    expect(prismaMock.company.update.mock.calls[0][0]).toEqual({
      where: { id: COMPANY_A },
      data: { intelligenceEnabled: false },
    })
    const event = prismaMock.billingEvent.create.mock.calls.at(-1)[0].data
    expect(event).toMatchObject({ type: 'CONTRACT_ENDED', companyId: COMPANY_A, actorId: null })
    // Sem a opção, `active` não é tocado e o auto-sync segue
    expect(clearScheduleMock).not.toHaveBeenCalled()
  })

  it('com "Desativar empresa também": active false na mesma transação e clearSchedule depois', async () => {
    mockEnding({ deactivateCompanyOnEnd: true })
    const order: string[] = []
    prismaMock.company.update.mockImplementation(async () => {
      order.push('company.update')
      return {}
    })
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(prismaMock)
      order.push('commit')
      return result
    })
    clearScheduleMock.mockImplementation(() => order.push('clearSchedule'))

    await closeEndedContracts(new Date('2026-11-01T03:00:00Z'))
    expect(prismaMock.company.update.mock.calls[0][0].data).toEqual({
      intelligenceEnabled: false,
      active: false,
    })
    expect(clearScheduleMock).toHaveBeenCalledWith(COMPANY_A)
    expect(order).toEqual(['company.update', 'commit', 'clearSchedule'])
  })

  it('outro processo já encerrou (updateMany sem linha): nada mais é escrito', async () => {
    mockEnding({ deactivateCompanyOnEnd: true })
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 0 })
    await expect(closeEndedContracts(new Date('2026-11-01T03:00:00Z'))).resolves.toBe(0)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(clearScheduleMock).not.toHaveBeenCalled()
  })

  it('cancela documentos SENT que sobraram, com autor null', async () => {
    mockEnding({ deactivateCompanyOnEnd: false })
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: 'doc-1', kind: 'AMENDMENT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    await closeEndedContracts(new Date('2026-11-01T03:00:00Z'))
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'CANCELLED',
      cancelledById: null,
    })
  })

  it('erro em um contrato vai ao Sentry e não lança', async () => {
    mockEnding({ deactivateCompanyOnEnd: false })
    prismaMock.company.update.mockRejectedValue(new Error('falha'))
    await expect(closeEndedContracts(new Date('2026-11-01T03:00:00Z'))).resolves.toBe(0)
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})

describe('rotas', () => {
  let app: FastifyInstance
  let tokens: Record<string, string>

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    tokens = {
      super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
      adminA: app.jwt.sign({
        sub: 'admin-a',
        email: 'a@a.com',
        role: 'ADMIN',
        companyId: COMPANY_A,
      }),
      salesA: app.jwt.sign({
        sub: 'sales-a',
        email: 'v@a.com',
        role: 'SALESPERSON',
        companyId: COMPANY_A,
      }),
    }
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true })
  })

  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` })
  const cancelUrl = `/admin/billing/clients/${COMPANY_A}/contract/cancel`
  const revertUrl = `${cancelUrl}/revert`

  it('ADMIN e vendedor levam 403 nas duas rotas', async () => {
    for (const who of ['adminA', 'salesA']) {
      const cancel = await app.inject({
        method: 'POST',
        url: cancelUrl,
        headers: auth(who),
        payload: INPUT,
      })
      const revert = await app.inject({ method: 'POST', url: revertUrl, headers: auth(who) })
      expect(cancel.statusCode).toBe(403)
      expect(revert.statusCode).toBe(403)
    }
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('SUPERADMIN agenda e recebe o endsAt', async () => {
    mockContract({})
    const res = await app.inject({
      method: 'POST',
      url: cancelUrl,
      headers: auth('super'),
      payload: INPUT,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().endsAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('motivo curto demais: 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: cancelUrl,
      headers: auth('super'),
      payload: { reason: 'x', deactivateCompany: true },
    })
    expect(res.statusCode).toBe(400)
  })

  it('o 409 sai com o código', async () => {
    mockContract({ status: 'DRAFT' })
    const res = await app.inject({
      method: 'POST',
      url: cancelUrl,
      headers: auth('super'),
      payload: INPUT,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
  })
})
