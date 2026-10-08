// Sync REST de clientes: bloqueio (A1_MSBLQL='1') fica só em msblql — o
// cliente bloqueado continua ativo (visível como Bloqueado, plano 010).
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

// A paginação real chama o Protheus; aqui ela só aplica o mapRecord às linhas
const rawRows: Record<string, unknown>[] = []
vi.mock('../paginated-fetch', () => ({
  fetchPaginated: async (opts: { mapRecord: (raw: Record<string, unknown>) => unknown }) => {
    const records = rawRows.map(opts.mapRecord).filter((r) => r !== null)
    return { records, totalRecords: records.length, totalFetched: records.length }
  },
}))
vi.mock('../protheus-logger', () => ({ logProtheusCall: async () => undefined }))
vi.mock('../utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils')>()),
  getCredentials: () => ({}),
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { syncCustomers } from '../customers.sync'

beforeEach(() => {
  resetPrismaMock()
  rawRows.length = 0
  prismaMock.company.findUniqueOrThrow.mockResolvedValue({
    id: 'c1',
    apiCliente: 'https://erp.example.com/clientes',
    syncSchedule: null,
  })
})

function upsertArgsFor(code: string) {
  const call = prismaMock.customer.upsert.mock.calls.find(
    ([args]: [{ where: { companyId_loja_protheusCode: { protheusCode: string } } }]) =>
      args.where.companyId_loja_protheusCode.protheusCode === code
  )
  return call?.[0]
}

describe('syncCustomers', () => {
  it('cliente com A1_MSBLQL=1 sincroniza com active=true e msblql=1', async () => {
    rawRows.push(
      { A1_COD: '000001', A1_LOJA: '01', A1_NOME: 'BLOQUEADO LTDA', A1_MSBLQL: '1' },
      { A1_COD: '000002', A1_LOJA: '01', A1_NOME: 'LIBERADO LTDA', A1_MSBLQL: '2' }
    )

    const result = await syncCustomers('c1')

    expect(result.synced).toBe(2)
    const blocked = upsertArgsFor('000001')
    expect(blocked.create).toMatchObject({ msblql: '1', active: true })
    expect(blocked.update).toMatchObject({ msblql: '1', active: true })
    const released = upsertArgsFor('000002')
    expect(released.update).toMatchObject({ msblql: '2', active: true })
  })
})
