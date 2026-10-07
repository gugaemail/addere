// Agregação de "Por que não vendeu" (E22) sobre fixtures.
import { describe, expect, it } from 'vitest'
import { buildNoOrderReport, type NoOrderFact } from '../no-order'

const fact = (over: Partial<NoOrderFact> = {}): NoOrderFact => ({
  ymd: '20261006',
  vendorCode: 'V1',
  sellerName: 'Renato',
  customerName: 'Mercado Ponto Certo',
  reason: 'sem verba no momento',
  planned: true,
  ...over,
})

describe('normalização burra', () => {
  it('dois textos que só diferem por caixa e espaço caem no mesmo bucket', () => {
    const report = buildNoOrderReport([
      fact({ reason: 'Sem Verba no Momento' }),
      fact({ reason: '  sem   verba no   momento  ' }),
    ])
    expect(report.buckets).toEqual([
      { normalized: 'sem verba no momento', sample: 'Sem Verba no Momento', count: 2 },
    ])
    expect(report.singletons).toBe(0)
  })

  it('pontuação final some, mas pontuação interna fica', () => {
    const report = buildNoOrderReport([
      fact({ reason: 'Comprou do concorrente, volta em 15 dias.' }),
      fact({ reason: 'comprou do concorrente, volta em 15 dias!' }),
    ])
    expect(report.buckets).toEqual([
      {
        normalized: 'comprou do concorrente, volta em 15 dias',
        sample: 'Comprou do concorrente, volta em 15 dias.',
        count: 2,
      },
    ])
  })
})

describe('motivos que não se repetem', () => {
  it('motivo que aparece uma vez entra em singletons e não em buckets', () => {
    const report = buildNoOrderReport([
      fact({ reason: 'dono não estava, volto quinta' }),
    ])
    expect(report.buckets).toEqual([])
    expect(report.singletons).toBe(1)
    expect(report.total).toBe(1)
  })

  it('mistura motivo repetido com motivos únicos', () => {
    const report = buildNoOrderReport([
      fact({ reason: 'preço alto' }),
      fact({ reason: 'preço alto' }),
      fact({ reason: 'estoque ainda cheio' }),
      fact({ reason: 'dono não estava' }),
    ])
    expect(report.buckets).toEqual([{ normalized: 'preço alto', sample: 'preço alto', count: 2 }])
    expect(report.singletons).toBe(2)
    expect(report.total).toBe(4)
  })
})

describe('recent', () => {
  it('vem ordenado do mais novo para o mais antigo e respeita o teto de 10', () => {
    const facts = Array.from({ length: 12 }, (_, i) =>
      fact({ ymd: `202610${String(i + 1).padStart(2, '0')}`, reason: `motivo ${i}` })
    )
    const report = buildNoOrderReport(facts)
    expect(report.recent).toHaveLength(10)
    expect(report.recent[0].ymd).toBe('20261012')
    expect(report.recent[9].ymd).toBe('20261003')
  })
})

describe('lista vazia', () => {
  it('devolve total: 0, buckets: [], singletons: 0', () => {
    const report = buildNoOrderReport([])
    expect(report).toEqual({ total: 0, buckets: [], singletons: 0, recent: [] })
  })
})

describe('empate de contagem', () => {
  it('desempata por normalized em ordem alfabética', () => {
    const report = buildNoOrderReport([
      fact({ reason: 'preço alto' }),
      fact({ reason: 'preço alto' }),
      fact({ reason: 'estoque cheio' }),
      fact({ reason: 'estoque cheio' }),
    ])
    expect(report.buckets.map((b) => b.normalized)).toEqual(['estoque cheio', 'preço alto'])
  })
})
