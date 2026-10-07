import { describe, expect, it } from 'vitest'
import { liftLabel, monthRange, ratioSubtitle, rangeLabel } from '../pilot-metrics'

describe('liftLabel', () => {
  it('lift positivo: tom "positivo" e texto a favor da sugestão do motor', () => {
    const result = liftLabel(21.3)
    expect(result.tone).toBe('positivo')
    expect(result.text).toContain('Quem o Addere mandou visitar comprou mais')
  })

  it('lift negativo: tom "negativo" e o texto exato que a tela precisa mostrar', () => {
    const result = liftLabel(-5.4)
    expect(result.tone).toBe('negativo')
    expect(result.text).toBe('A escolha do vendedor converteu mais nesta janela')
  })

  it('liftPp null: tom "indefinido", sem denominador para comparar', () => {
    const result = liftLabel(null)
    expect(result.tone).toBe('indefinido')
    expect(result.text).toBe('Ainda não há visitas fora do plano suficientes para comparar')
  })
})

describe('ratioSubtitle', () => {
  it('monta "N de M clientes" com o padrão', () => {
    expect(ratioSubtitle({ total: 64, hits: 40, pct: 62.5 })).toBe('40 de 64 clientes')
  })

  it('troca a unidade quando passada (recuperação de risco)', () => {
    expect(ratioSubtitle({ total: 35, hits: 8, pct: 22.9 }, 'em risco')).toBe('8 de 35 em risco')
  })

  it('total zero devolve a frase de ausência, não "0 de 0"', () => {
    expect(ratioSubtitle({ total: 0, hits: 0, pct: null })).toBe('sem clientes na janela')
  })
})

describe('rangeLabel', () => {
  it('formata as duas pontas sempre com DD/MM/YYYY', () => {
    expect(rangeLabel('20261001', '20261006')).toBe('01/10/2026 a 06/10/2026')
  })
})

describe('monthRange', () => {
  it('current: dia 1 do mês corrente até hoje', () => {
    expect(monthRange('current', '2026-10-06')).toEqual({ from: '2026-10-01', to: '2026-10-06' })
  })

  it('previous: fevereiro em ano bissexto (2028) termina em 29, não 28', () => {
    expect(monthRange('previous', '2028-03-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('previous: fevereiro em ano comum (2027) termina em 28', () => {
    expect(monthRange('previous', '2027-03-10')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it('previous: mês de 31 dias (janeiro/2026) termina em 31, não em 30', () => {
    expect(monthRange('previous', '2026-02-05')).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })

  it('virada de ano: em janeiro, previous é dezembro do ano anterior', () => {
    expect(monthRange('previous', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('virada de ano: em janeiro, last3 são out/nov/dez do ano anterior', () => {
    expect(monthRange('last3', '2026-01-15')).toEqual({ from: '2025-10-01', to: '2025-12-31' })
  })

  it('last3 fora da virada: os três meses fechados antes do corrente', () => {
    expect(monthRange('last3', '2026-10-06')).toEqual({ from: '2026-07-01', to: '2026-09-30' })
  })
})
