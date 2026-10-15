import { keyboardOverlap } from '../keyboard'

describe('keyboardOverlap', () => {
  it('é 0 com o teclado fechado', () => {
    expect(keyboardOverlap(800, null)).toBe(0)
  })

  it('é 0 quando a view termina acima do teclado', () => {
    // Tela acima da tab bar: termina em 700, o teclado começa em 720
    expect(keyboardOverlap(700, 720)).toBe(0)
  })

  it('é a parte da view que fica atrás do teclado', () => {
    // Tela de 844 pt com teclado de 336 pt: topo do teclado em 508
    expect(keyboardOverlap(844, 508)).toBe(336)
    // Tela que termina na tab bar (783) cobre menos
    expect(keyboardOverlap(783, 508)).toBe(275)
  })

  it('arredonda para não deixar meia linha de pixel', () => {
    expect(keyboardOverlap(800.4, 500)).toBe(300)
  })

  it('ignora o topo 0 do iOS com transições cruzadas', () => {
    expect(keyboardOverlap(844, 0)).toBe(0)
  })
})
