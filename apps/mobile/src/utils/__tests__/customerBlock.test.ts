import { isCustomerBlocked } from '@addere/types'
import { canMessageFor, canOrderFor, showRegistryBlockedBadge } from '../customerBlock'

describe('isCustomerBlocked', () => {
  it("só A1_MSBLQL = '1' é bloqueado (com ou sem espaços do Protheus)", () => {
    expect(isCustomerBlocked('1')).toBe(true)
    expect(isCustomerBlocked(' 1 ')).toBe(true)
  })

  it('qualquer outro valor é liberado', () => {
    expect(isCustomerBlocked('2')).toBe(false)
    expect(isCustomerBlocked('')).toBe(false)
    expect(isCustomerBlocked(' ')).toBe(false)
    expect(isCustomerBlocked(null)).toBe(false)
    expect(isCustomerBlocked(undefined)).toBe(false)
  })
})

describe('canOrderFor — seletor de cliente do pedido', () => {
  it('bloqueado fica desabilitado no seletor', () => {
    expect(canOrderFor({ msblql: '1' })).toBe(false)
  })

  it('liberado ou sem bloqueio pode ser escolhido', () => {
    expect(canOrderFor({ msblql: '2' })).toBe(true)
    expect(canOrderFor({ msblql: null })).toBe(true)
  })
})

describe('showRegistryBlockedBadge — selo na Ficha', () => {
  it('mostra o selo do cadastro sem Inteligência ou com outro status do motor', () => {
    expect(showRegistryBlockedBadge('1', null)).toBe(true)
    expect(showRegistryBlockedBadge('1', 'ON_CYCLE')).toBe(true)
  })

  it('não repete quando o motor já mostra BLOCKED', () => {
    expect(showRegistryBlockedBadge('1', 'BLOCKED')).toBe(false)
  })

  it('cliente liberado não ganha selo do cadastro', () => {
    expect(showRegistryBlockedBadge('2', null)).toBe(false)
    expect(showRegistryBlockedBadge(null, 'LATE')).toBe(false)
  })
})

describe('canMessageFor — mensagem ao cliente (plano 012)', () => {
  it('bloqueado no cadastro ou pelo motor não recebe mensagem de oferta', () => {
    expect(canMessageFor('1', 'ON_CYCLE')).toBe(false)
    expect(canMessageFor(null, 'BLOCKED')).toBe(false)
    expect(canMessageFor(undefined, 'BLOCKED')).toBe(false)
  })

  it('liberado e fora de BLOCKED pode receber', () => {
    expect(canMessageFor('2', 'LATE')).toBe(true)
    expect(canMessageFor(null, null)).toBe(true)
  })
})
