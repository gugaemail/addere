// Câmbio do custo de IA: PTAX venda do BCB, renovada a cada 6 h. Se o BCB
// falhar, vale a última cotação gravada, marcada como desatualizada.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

const axiosGet = vi.fn()
vi.mock('axios', () => ({ default: { get: (...args: unknown[]) => axiosGet(...args) } }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { fetchPtax, getUsdBrlRate, resetUsdBrlState } from '../usd-brl'

const NOW = new Date('2026-10-29T18:00:00Z')

// Trecho do retorno real da API Olinda (29/10/2026)
const BCB_RESPONSE = {
  value: [
    { cotacaoVenda: 5.3346, dataHoraCotacao: '2026-10-27 13:05:26.521898' },
    { cotacaoVenda: 5.3744, dataHoraCotacao: '2026-10-29 13:11:53.555689' },
    { cotacaoVenda: 5.342, dataHoraCotacao: '2026-10-28 13:05:31.600448' },
  ],
}

beforeEach(() => {
  resetPrismaMock()
  resetUsdBrlState()
  axiosGet.mockReset()
})

describe('fetchPtax', () => {
  it('pega a cotação mais recente da janela, no horário de Brasília', async () => {
    axiosGet.mockResolvedValue({ data: BCB_RESPONSE })

    const quote = await fetchPtax(NOW)

    expect(quote.rate).toBe(5.3744)
    expect(quote.quotedAt.toISOString()).toBe('2026-10-29T16:11:53.000Z')
    const url = axiosGet.mock.calls[0][0] as string
    expect(url).toContain("@dataInicial='10-19-2026'")
    expect(url).toContain("@dataFinalCotacao='10-29-2026'")
  })

  it('janela sem cotação: erro', async () => {
    axiosGet.mockResolvedValue({ data: { value: [] } })
    await expect(fetchPtax(NOW)).rejects.toThrow('PTAX sem cotação')
  })
})

describe('getUsdBrlRate', () => {
  it('cotação gravada há menos de 6 h: não consulta o BCB', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({
      usdBrlRate: '5.3420',
      usdBrlRateAt: new Date('2026-10-28T16:05:31Z'),
      usdBrlFetchedAt: new Date('2026-10-29T15:00:00Z'),
    })

    expect(await getUsdBrlRate(NOW)).toEqual({
      rate: 5.342,
      quotedAt: '2026-10-28T16:05:31.000Z',
      stale: false,
    })
    expect(axiosGet).not.toHaveBeenCalled()
  })

  it('cotação velha: consulta o BCB e grava a nova', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({
      usdBrlRate: '5.3420',
      usdBrlRateAt: new Date('2026-10-28T16:05:31Z'),
      usdBrlFetchedAt: new Date('2026-10-29T08:00:00Z'),
    })
    axiosGet.mockResolvedValue({ data: BCB_RESPONSE })

    const rate = await getUsdBrlRate(NOW)

    expect(rate).toMatchObject({ rate: 5.3744, stale: false })
    expect(prismaMock.billingSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'global' },
        update: expect.objectContaining({ usdBrlRate: 5.3744, usdBrlFetchedAt: NOW }),
      })
    )
  })

  it('BCB fora do ar: a última cotação, marcada como desatualizada, e não tenta de novo logo', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({
      usdBrlRate: '5.3420',
      usdBrlRateAt: new Date('2026-10-28T16:05:31Z'),
      usdBrlFetchedAt: new Date('2026-10-29T08:00:00Z'),
    })
    axiosGet.mockRejectedValue(new Error('timeout'))

    expect(await getUsdBrlRate(NOW)).toMatchObject({ rate: 5.342, stale: true })
    expect(await getUsdBrlRate(new Date(NOW.getTime() + 60_000))).toMatchObject({
      rate: 5.342,
      stale: true,
    })
    expect(axiosGet).toHaveBeenCalledTimes(1)
  })

  it('nunca houve cotação e o BCB falhou: sem câmbio', async () => {
    axiosGet.mockRejectedValue(new Error('timeout'))
    expect(await getUsdBrlRate(NOW)).toEqual({ rate: null, quotedAt: null, stale: true })
  })
})
