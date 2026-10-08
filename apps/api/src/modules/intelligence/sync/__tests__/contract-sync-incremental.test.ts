import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

const runMock = vi.fn()
vi.mock('../../protheus-sql/sql-api.adapter', () => ({
  resolveSqlAdapter: () => ({ run: runMock }),
}))

import type { Company } from '@prisma/client'
import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { syncContract } from '../contract-sync.service'

const COMPANY = { id: 'c1' } as Company

// Consulta incremental de títulos, no formato da referência (plano 009)
const TITLES_SQL = `SELECT titulo FROM SE1010 WHERE E1_FILIAL IN ({{FILIAL}})
  AND (({{INCREMENTAL}} = 1 AND S_T_A_M_P_ > {{DESDE}})
    OR ({{INCREMENTAL}} = 0 AND E1_SALDO > 0 AND D_E_L_E_T_ = ' '))`
const SALES_SQL = `SELECT pedido FROM SD2010 WHERE D2_FILIAL IN ({{FILIAL}})
  AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}
  AND (({{INCREMENTAL}} = 1 AND D2.S_T_A_M_P_ > {{DESDE}}) OR {{INCREMENTAL}} = 0)`
const LEGACY_TITLES_SQL = `SELECT titulo FROM SE1010 WHERE E1_FILIAL IN ({{FILIAL}}) AND E1_SALDO > 0`

function title(ref: string, saldo: number, stamp: string, excluido = ' ') {
  return {
    titulo: ref,
    cliente_cod: 'C1',
    cliente_loja: '01',
    vencimento: '20261001',
    valor_saldo: saldo,
    excluido,
    stamp,
  }
}

function publish(sql: string) {
  prismaMock.intelQuery.findFirst.mockResolvedValue({ sql })
}

function executedSql(): string {
  return runMock.mock.calls[0][1]
}

beforeEach(() => {
  resetPrismaMock()
  runMock.mockReset()
  prismaMock.branch.findMany.mockResolvedValue([{ idProtheus: '01' }])
})

describe('syncContract — consulta legada (sem {{DESDE}})', () => {
  it('continua substituindo tudo e nem consulta o cursor', async () => {
    publish(LEGACY_TITLES_SQL)
    runMock.mockResolvedValue({ rows: [title('T1', 100, '')], ms: 5 })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.mode).toBe('legacy')
    expect(prismaMock.openTitle.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'c1' } })
    expect(prismaMock.openTitle.createMany).toHaveBeenCalled()
    expect(prismaMock.intelSyncCursor.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.intelSyncCursor.create).not.toHaveBeenCalled()
  })
})

describe('syncContract — OPEN_TITLES incremental', () => {
  it('sem cursor: foto completa (INCREMENTAL = 0) e cria o cursor com o maior carimbo', async () => {
    publish(TITLES_SQL)
    runMock.mockResolvedValue({
      rows: [title('T1', 100, '2026-10-01 11:43:19.920'), title('T2', 50, '2026-10-02 08:00:00.000')],
      ms: 5,
    })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.mode).toBe('full')
    expect(executedSql()).toContain('0 = 1 AND')
    expect(executedSql()).toContain("'1900-01-01T00:00:00.000'")
    expect(prismaMock.openTitle.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'c1' } })
    expect(prismaMock.intelSyncCursor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'OPEN_TITLES', stamp: '2026-10-02 08:00:00.000' }),
    })
  })

  it('com cursor: pede só o que mudou, tira baixado e excluído, faz upsert do resto', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({
      rows: [
        title('PAGO', 0, '2026-10-08 12:00:00.000'),
        title('APAGADO', 300, '2026-10-08 12:01:00.000', '*'),
        title('NOVO', 80, '2026-10-08 12:02:00.000'),
      ],
      ms: 5,
    })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.mode).toBe('incremental')
    expect(executedSql()).toContain('1 = 1 AND')
    // Cursor menos os 10 minutos de folga, em ISO com T
    expect(executedSql()).toContain("'2026-10-08T11:33:19.920'")
    // Nenhuma substituição total no incremental
    expect(prismaMock.openTitle.deleteMany).not.toHaveBeenCalledWith({ where: { companyId: 'c1' } })
    const gone = prismaMock.openTitle.deleteMany.mock.calls[0][0].where.titleRef.in
    expect(gone.sort()).toEqual(['APAGADO', 'PAGO'])
    expect(prismaMock.openTitle.upsert).toHaveBeenCalledTimes(1)
    expect(prismaMock.openTitle.upsert.mock.calls[0][0].where.companyId_titleRef.titleRef).toBe(
      'NOVO'
    )
    expect(prismaMock.intelSyncCursor.update).toHaveBeenCalledWith({
      where: { companyId_name: { companyId: 'c1', name: 'OPEN_TITLES' } },
      data: { stamp: '2026-10-08 12:02:00.000' },
    })
  })

  it('lote vazio não mexe no cursor', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({ rows: [], ms: 5 })

    await syncContract(COMPANY, 'OPEN_TITLES')

    expect(prismaMock.intelSyncCursor.update).not.toHaveBeenCalled()
  })

  it('consulta sem a coluna stamp falha alto em vez de andar o cursor às cegas', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    const { stamp: _ignored, ...semCarimbo } = title('T1', 10, '')
    runMock.mockResolvedValue({ rows: [semCarimbo], ms: 5 })

    await expect(syncContract(COMPANY, 'OPEN_TITLES')).rejects.toThrow(/coluna stamp/)
    expect(prismaMock.intelSyncCursor.update).not.toHaveBeenCalled()
  })

  it('carimbo NULL no incremental não é erro: grava a linha e o cursor anda pelos outros', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({
      rows: [
        { ...title('VELHO', 10, ''), stamp: null },
        title('NOVO', 20, '2026-10-08 12:00:00.000'),
      ],
      ms: 5,
    })

    await syncContract(COMPANY, 'OPEN_TITLES')

    expect(prismaMock.openTitle.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.intelSyncCursor.update).toHaveBeenCalledWith({
      where: { companyId_name: { companyId: 'c1', name: 'OPEN_TITLES' } },
      data: { stamp: '2026-10-08 12:00:00.000' },
    })
  })

  it('primeira carga com todos os carimbos NULL cria o cursor no piso — não fica preso no completo', async () => {
    publish(TITLES_SQL)
    runMock.mockResolvedValue({
      rows: [{ ...title('T1', 10, ''), stamp: null }, { ...title('T2', 20, ''), stamp: null }],
      ms: 5,
    })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.mode).toBe('full')
    expect(result.errors).toEqual([])
    expect(prismaMock.intelSyncCursor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'OPEN_TITLES', stamp: '1900-01-01 00:00:00.000' }),
    })
  })

  it('carga completa sem a coluna stamp avisa e não cria cursor', async () => {
    publish(TITLES_SQL)
    const { stamp: _ignored, ...semCarimbo } = title('T1', 10, '')
    runMock.mockResolvedValue({ rows: [semCarimbo], ms: 5 })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.errors.join(' ')).toMatch(/sem a coluna stamp/)
    expect(prismaMock.intelSyncCursor.create).not.toHaveBeenCalled()
  })

  it('falha de gravação segura o cursor (a próxima execução relê)', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    prismaMock.openTitle.upsert.mockRejectedValue(new Error('deadlock'))
    runMock.mockResolvedValue({ rows: [title('T1', 10, '2026-10-08 12:00:00.000')], ms: 5 })

    const result = await syncContract(COMPANY, 'OPEN_TITLES')

    expect(result.errors.join(' ')).toMatch(/deadlock/)
    expect(prismaMock.intelSyncCursor.update).not.toHaveBeenCalled()
  })

  it('carga semanal (full) substitui a foto e não move um cursor existente', async () => {
    publish(TITLES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({ rows: [title('T1', 10, '2026-10-09 09:00:00.000')], ms: 5 })

    const result = await syncContract(COMPANY, 'OPEN_TITLES', undefined, { full: true })

    expect(result.mode).toBe('full')
    expect(prismaMock.openTitle.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'c1' } })
    expect(prismaMock.intelSyncCursor.update).toHaveBeenCalledWith({
      where: { companyId_name: { companyId: 'c1', name: 'OPEN_TITLES' } },
      data: { lastFullAt: expect.any(Date) },
    })
  })
})

describe('syncContract — SALES incremental', () => {
  it('nota cancelada com 60 dias sai pela chave — a janela de 7 dias nunca a alcançava', async () => {
    publish(SALES_SQL)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({
      rows: [
        {
          pedido: 'NF000123001',
          item: '01',
          data: '20260809',
          cliente_cod: 'C1',
          cliente_loja: '01',
          vendedor_cod: 'V1',
          produto_cod: 'P1',
          quantidade: 2,
          valor: 300,
          excluido: '*',
          stamp: '2026-10-08 11:59:35.900',
        },
      ],
      ms: 5,
    })

    const result = await syncContract(COMPANY, 'SALES')

    expect(result.mode).toBe('incremental')
    // Janela larga no incremental: o filtro de verdade é o carimbo
    const [ini] = executedSql().match(/BETWEEN '(\d{8})'/)!.slice(1)
    expect(Number(ini)).toBeLessThan(20251001)
    expect(prismaMock.salesItem.deleteMany).toHaveBeenCalledWith({
      where: {
        companyId: 'c1',
        OR: [{ orderRef: 'NF000123001', itemSeq: '01', productCode: 'P1' }],
      },
    })
    expect(prismaMock.salesItem.upsert).not.toHaveBeenCalled()
  })
})

describe('syncContract — CUSTOMERS incremental', () => {
  it('cliente excluído no Protheus vira active=false; o vivo segue para o enriquecimento', async () => {
    publish(`SELECT 1 FROM SA1010 WHERE A1_FILIAL IN ({{FILIAL}})
      AND (({{INCREMENTAL}} = 1 AND S_T_A_M_P_ > {{DESDE}}) OR {{INCREMENTAL}} = 0)`)
    prismaMock.intelSyncCursor.findUnique.mockResolvedValue({ stamp: '2026-10-08 11:43:19.920' })
    runMock.mockResolvedValue({
      rows: [
        { cliente_cod: 'GONE', cliente_loja: '01', excluido: '*', stamp: '2026-10-08 12:00:00.000' },
        {
          cliente_cod: 'LIVE',
          cliente_loja: '01',
          limite_credito: 5000,
          excluido: ' ',
          stamp: '2026-10-08 12:01:00.000',
        },
      ],
      ms: 5,
    })

    await syncContract(COMPANY, 'CUSTOMERS')

    const calls = prismaMock.customer.updateMany.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContainEqual({
      where: { companyId: 'c1', protheusCode: 'GONE', loja: '01' },
      data: { active: false },
    })
    const live = calls.find(
      (c: { where: { protheusCode: string } }) => c.where.protheusCode === 'LIVE'
    )
    expect(live.data).toMatchObject({ creditLimit: 5000 })
    expect(live.data).not.toHaveProperty('active')
  })
})
