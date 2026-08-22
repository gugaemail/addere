import { describe, it, expect } from 'vitest'
import { selfCheck, extractNumbers, type SelfCheckFacts } from '../self-check'

const facts = (over: Partial<SelfCheckFacts> = {}): SelfCheckFacts => ({
  customers: [
    { pseudonym: 'C1', status: 'LATE' },
    { pseudonym: 'C2', status: 'BLOCKED' },
    { pseudonym: 'C3', status: 'NEW' },
  ],
  numbers: [28, 41, 1500, 900, 3, 10],
  freshnessLine: 'Dados sincronizados: 03:12',
  ...over,
})

const FOOTER = 'Dados sincronizados: 03:12'

describe('extractNumbers', () => {
  it('formatos BR, US, inteiro e percentual', () => {
    expect(extractNumbers('R$ 1.234,56 e 28 dias e 12,5%')).toEqual([1234.56, 28, 12.5])
    expect(extractNumbers('total 1.500 unidades')).toEqual([1500])
  })

  it('pseudônimos não viram números', () => {
    expect(extractNumbers('visite C12 hoje')).toEqual([])
  })
})

describe('selfCheck — clientes citados', () => {
  it('aprova texto com clientes e números dos fatos', () => {
    const r = selfCheck(`C1 compra a cada 28 dias, está no dia 41. ${FOOTER}`, facts())
    expect(r.ok).toBe(true)
  })

  it('reprova cliente inventado', () => {
    const r = selfCheck(`Visite C7 hoje. ${FOOTER}`, facts())
    expect(r.ok).toBe(false)
    expect(r.violations[0]).toContain('C7')
  })

  it('texto sem citar cliente algum é aceito', () => {
    expect(selfCheck(`Bom dia! Meta em andamento. ${FOOTER}`, facts()).ok).toBe(true)
  })
})

describe('selfCheck — números citados', () => {
  it('reprova número que não existe nos fatos', () => {
    const r = selfCheck(`C1 deve fechar R$ 9.999 hoje. ${FOOTER}`, facts())
    expect(r.ok).toBe(false)
    expect(r.violations[0]).toContain('9999')
  })

  it('tolera arredondamento (1%)', () => {
    // fato 1500 → citar 1.512 (0,8%) passa; 1600 não
    expect(selfCheck(`C1: R$ 1.512 previstos. ${FOOTER}`, facts()).ok).toBe(true)
    expect(selfCheck(`C1: R$ 1.600 previstos. ${FOOTER}`, facts()).ok).toBe(false)
  })

  it('números da linha de frescor não são cobrados', () => {
    expect(selfCheck(`Tudo certo por hoje. ${FOOTER}`, facts()).ok).toBe(true)
  })

  it('percentual citado precisa existir', () => {
    const r = selfCheck(`C1 caiu 80% no trimestre. ${FOOTER}`, facts())
    expect(r.ok).toBe(false)
  })
})

describe('selfCheck — bloqueado sem ação de venda', () => {
  it.each(['venda para C2 hoje', 'ofereça o mix novo a C2', 'proponha um pedido a C2', 'feche com C2'])(
    'reprova: "%s"',
    (sentence) => {
      const r = selfCheck(`${sentence}. ${FOOTER}`, facts())
      expect(r.ok).toBe(false)
      expect(r.violations.some((v) => v.includes('bloqueado'))).toBe(true)
    }
  )

  it('aprova ação de resolver pendência do bloqueado', () => {
    const r = selfCheck(`C2 está bloqueado: resolva o título de 3 dias antes de visitar. ${FOOTER}`, facts())
    expect(r.ok).toBe(true)
  })

  it('venda para NÃO-bloqueado passa', () => {
    expect(selfCheck(`Ofereça o mix habitual a C1. ${FOOTER}`, facts()).ok).toBe(true)
  })
})

describe('selfCheck — novo sem certeza de ciclo', () => {
  it('reprova "compra a cada X dias" para cliente novo', () => {
    const r = selfCheck(`C3 compra a cada 28 dias. ${FOOTER}`, facts())
    expect(r.ok).toBe(false)
    expect(r.violations.some((v) => v.includes('novo'))).toBe(true)
  })

  it('ciclo afirmado para cliente com histórico passa', () => {
    expect(selfCheck(`C1 compra a cada 28 dias. ${FOOTER}`, facts()).ok).toBe(true)
  })

  it('novo citado sem ciclo passa', () => {
    expect(selfCheck(`C3 fez 3 pedidos, vale visita de aproximação. ${FOOTER}`, facts()).ok).toBe(true)
  })
})

describe('selfCheck — rodapé de frescor', () => {
  it('reprova quando a linha exigida não está no texto', () => {
    const r = selfCheck('C1 compra a cada 28 dias.', facts())
    expect(r.ok).toBe(false)
    expect(r.violations).toContain('linha de frescor ausente')
  })

  it('freshnessLine=null não exige rodapé', () => {
    expect(selfCheck('C1 compra a cada 28 dias.', facts({ freshnessLine: null })).ok).toBe(true)
  })
})

describe('selfCheck — acumula múltiplas violações', () => {
  it('reporta todas de uma vez', () => {
    const r = selfCheck('C9 deve R$ 7.777. Venda algo para C2.', facts())
    expect(r.violations.length).toBeGreaterThanOrEqual(3) // inventado + número + bloqueado + frescor
  })
})
