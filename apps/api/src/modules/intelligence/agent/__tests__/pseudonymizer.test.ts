import { describe, it, expect } from 'vitest'
import { Pseudonymizer } from '../pseudonymizer'

describe('Pseudonymizer', () => {
  it('mapeia estável dentro da requisição e traduz de volta', () => {
    const p = new Pseudonymizer()
    expect(p.code('000123|01')).toBe('C1')
    expect(p.code('000456|01')).toBe('C2')
    expect(p.code('000123|01')).toBe('C1') // estável
    expect(p.real('C2')).toBe('000456|01')
    expect(p.real('C9')).toBeNull()
  })

  it('instâncias são isoladas (mapa só em memória por requisição)', () => {
    const a = new Pseudonymizer()
    const b = new Pseudonymizer()
    a.code('X|01')
    expect(b.real('C1')).toBeNull()
  })

  it('reidrata o texto com nomes reais', () => {
    const p = new Pseudonymizer()
    p.code('000123|01')
    p.code('000456|02')
    const names = new Map([
      ['000123|01', 'Padaria Central'],
      ['000456|02', 'Mercado Bom Preço'],
    ])
    expect(p.rehydrate('Visite C1 e depois C2. C3 não existe.', names)).toBe(
      'Visite Padaria Central e depois Mercado Bom Preço. C3 não existe.'
    )
  })
})
