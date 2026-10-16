// Trava de licenças (plano 015, passo 2). O mock não simula concorrência: o
// teste de ordem prova que a trava (updateMany) vem antes da contagem e da
// escrita; o raciocínio do topo de seat-guard.ts prova o resto.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { withSeat, writeWithSeatGuard } from '../seat-guard'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const PAST = new Date('2026-09-01T12:00:00Z')

type Terms = {
  status: string
  version: number
  effectiveFrom: Date | null
  includedSeats: number
  extraSeats: number
  origin?: string
}

const terms = (over: Partial<Terms> = {}): Terms => ({
  status: 'EFFECTIVE',
  version: 1,
  effectiveFrom: PAST,
  includedSeats: 20,
  extraSeats: 2,
  ...over,
})

/** Contrato com linha (a trava pega), no status pedido, e os termos EFFECTIVE */
function contract(status: string, effective: Terms[] = [terms()]) {
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.companyContract.findUnique.mockResolvedValue({ id: 'contract-1', status })
  prismaMock.contractTerms.findMany.mockResolvedValue(effective)
}

const used = (n: number) => prismaMock.user.count.mockResolvedValue(n)

let write: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetPrismaMock()
  write = vi.fn(async () => 'ok')
})

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (err) {
    return err as { statusCode: number; code?: string; details?: unknown }
  }
  throw new Error('esperava recusa')
}

describe('withSeat', () => {
  it('sem contrato: escreve, sem contar', async () => {
    // updateMany responde { count: 0 } por padrão no mock
    await expect(withSeat(COMPANY, write)).resolves.toBe('ok')
    expect(write).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.count).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'PENDING_ACCEPTANCE'])(
    'contrato em %s: antes do aceite nada começa',
    async (status) => {
      contract(status)
      used(500)
      await expect(withSeat(COMPANY, write)).resolves.toBe('ok')
      expect(write).toHaveBeenCalledTimes(1)
    }
  )

  it('contrato cancelado: 409 CONTRACT_CANCELLED', async () => {
    contract('CANCELLED')
    const err = await refusal(withSeat(COMPANY, write))
    expect(err).toMatchObject({ statusCode: 409, code: 'CONTRACT_CANCELLED' })
    expect(write).not.toHaveBeenCalled()
  })

  it('limite − 1: escreve', async () => {
    contract('ACTIVE')
    used(21)
    await expect(withSeat(COMPANY, write)).resolves.toBe('ok')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('no limite: 409 SEAT_LIMIT_REACHED com used e limit', async () => {
    contract('ACTIVE')
    used(22)
    const err = await refusal(withSeat(COMPANY, write))
    expect(err).toMatchObject({
      statusCode: 409,
      code: 'SEAT_LIMIT_REACHED',
      details: { used: 22, limit: 22 },
    })
    expect(write).not.toHaveBeenCalled()
  })

  it('acima do limite (redução de pacote): recusa e não desativa ninguém', async () => {
    contract('ACTIVE')
    used(24)
    const err = await refusal(withSeat(COMPANY, write))
    expect(err).toMatchObject({ statusCode: 409, code: 'SEAT_LIMIT_REACHED' })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('Ilimitado com quantidade digitada: 99 de 100 passa, 100 de 100 recusa', async () => {
    contract('ACTIVE', [terms({ includedSeats: 100, extraSeats: 0 })])
    used(99)
    await expect(withSeat(COMPANY, write)).resolves.toBe('ok')

    used(100)
    const err = await refusal(withSeat(COMPANY, write))
    expect(err).toMatchObject({ code: 'SEAT_LIMIT_REACHED', details: { used: 100, limit: 100 } })
  })

  it('termos com "vale a partir de" no futuro não contam', async () => {
    contract('ACTIVE', [
      terms({ includedSeats: 20, extraSeats: 0 }),
      terms({
        version: 2,
        includedSeats: 30,
        extraSeats: 0,
        effectiveFrom: new Date(Date.now() + 86_400_000),
      }),
    ])
    used(20)
    const err = await refusal(withSeat(COMPANY, write))
    expect(err).toMatchObject({ code: 'SEAT_LIMIT_REACHED', details: { used: 20, limit: 20 } })
  })

  it('termos de pedido aprovado contam na hora', async () => {
    contract('ACTIVE', [
      terms({ includedSeats: 20, extraSeats: 0 }),
      terms({
        version: 2,
        origin: 'LICENSE_REQUEST',
        includedSeats: 20,
        extraSeats: 2,
        effectiveFrom: new Date(Date.now() - 60_000),
      }),
    ])
    used(21)
    await expect(withSeat(COMPANY, write)).resolves.toBe('ok')
  })

  it('só pede os termos EFFECTIVE do contrato', async () => {
    contract('ACTIVE')
    used(0)
    await withSeat(COMPANY, write)
    const where = prismaMock.contractTerms.findMany.mock.calls[0][0].where
    expect(where).toEqual({ contractId: 'contract-1', status: 'EFFECTIVE' })
  })

  it('contrato ACTIVE sem termos vigentes é invariante quebrada: Error, não "sem limite"', async () => {
    contract('ACTIVE', [])
    used(0)
    await expect(withSeat(COMPANY, write)).rejects.toThrow(/sem termos vigentes/)
    expect(write).not.toHaveBeenCalled()
  })

  it('ordem: trava, contagem, escrita — tudo com o tx', async () => {
    contract('ACTIVE')
    used(0)
    await withSeat(COMPANY, write)

    const lock = prismaMock.companyContract.updateMany.mock
    expect(lock.calls[0][0]).toEqual({
      where: { companyId: COMPANY },
      data: { seatGuardVersion: { increment: 1 } },
    })
    const lockOrder = lock.invocationCallOrder[0]
    const countOrder = prismaMock.user.count.mock.invocationCallOrder[0]
    const writeOrder = write.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(countOrder)
    expect(countOrder).toBeLessThan(writeOrder)
    // O mock de $transaction entrega o próprio prismaMock como tx
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(prismaMock)
  })
})

describe('writeWithSeatGuard', () => {
  const seller = { role: 'SALESPERSON', active: true, companyId: COMPANY }

  it('sem consumo: não abre transação e escreve direto', async () => {
    await expect(writeWithSeatGuard(seller, seller, write)).resolves.toBe('ok')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith(prismaMock)
  })

  it('desativar nunca passa pela trava', async () => {
    await writeWithSeatGuard(seller, { ...seller, active: false }, write)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('com consumo: passa pela trava da empresa de destino', async () => {
    contract('ACTIVE')
    used(22)
    const err = await refusal(writeWithSeatGuard(null, seller, write))
    expect(err).toMatchObject({ code: 'SEAT_LIMIT_REACHED' })
    expect(prismaMock.companyContract.updateMany.mock.calls[0][0].where).toEqual({
      companyId: COMPANY,
    })
    expect(write).not.toHaveBeenCalled()
  })
})
