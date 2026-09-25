// O recorte por empresa escondeu um usuário órfão da única tela que o conserta.
import { describe, expect, it } from 'vitest'
import type { UserPublic } from '@addere/types'
import { isCompanyless, managerOptions, scopeUsersToCompany } from '../user-scope'

const ACME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OUTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function user(over: Partial<UserPublic> & { id: string }): UserPublic {
  return {
    name: over.id,
    email: `${over.id}@addere.dev`,
    role: 'SALESPERSON',
    active: true,
    idVendProt: null,
    createdAt: '2026-08-25T00:00:00.000Z',
    companyId: ACME,
    ...over,
  }
}

describe('isCompanyless', () => {
  it('vendedor sem empresa é órfão', () => {
    expect(isCompanyless({ companyId: null, role: 'SALESPERSON' })).toBe(true)
    expect(isCompanyless({ companyId: undefined, role: 'ADMIN' })).toBe(true)
  })

  it('superadmin sem empresa é o estado normal dele', () => {
    expect(isCompanyless({ companyId: null, role: 'SUPERADMIN' })).toBe(false)
  })

  it('quem tem empresa nunca é órfão', () => {
    expect(isCompanyless({ companyId: ACME, role: 'SALESPERSON' })).toBe(false)
  })
})

describe('scopeUsersToCompany', () => {
  const lista = [
    user({ id: 'daqui' }),
    user({ id: 'de-outra', companyId: OUTRA }),
    user({ id: 'orfao', companyId: null }),
    user({ id: 'super', companyId: null, role: 'SUPERADMIN' }),
  ]

  it('sem empresa selecionada devolve tudo', () => {
    expect(scopeUsersToCompany(lista, null)).toHaveLength(4)
  })

  it('mantém o órfão visível dentro do recorte da empresa', () => {
    // É o bug do "Gustavo Gerente": filtrar só por companyId o apagava da tela
    expect(scopeUsersToCompany(lista, ACME).map((u) => u.id)).toEqual(['daqui', 'orfao'])
  })

  it('não vaza usuário de outra empresa nem o superadmin global', () => {
    const ids = scopeUsersToCompany(lista, ACME).map((u) => u.id)
    expect(ids).not.toContain('de-outra')
    expect(ids).not.toContain('super')
  })

  it('preserva a ordem original (a API já devolve por criação desc)', () => {
    const ids = scopeUsersToCompany(lista, ACME).map((u) => u.id)
    expect(ids).toEqual(
      [...ids].sort(
        (a, b) => lista.findIndex((u) => u.id === a) - lista.findIndex((u) => u.id === b)
      )
    )
  })
})

describe('managerOptions', () => {
  const lista = [
    user({ id: 'gerente', intelManager: true }),
    user({ id: 'gerente-inativo', intelManager: true, active: false }),
    user({ id: 'gerente-de-outra', intelManager: true, companyId: OUTRA }),
    user({ id: 'gerente-orfao', intelManager: true, companyId: null }),
    user({ id: 'vendedor' }),
  ]

  it('só gerente ativo da mesma empresa', () => {
    expect(managerOptions(lista, ACME)).toEqual([{ id: 'gerente', name: 'gerente' }])
  })

  it('sem empresa definida não oferece ninguém', () => {
    // assertValidManager da API recusaria: gerente tem de ser da mesma empresa
    expect(managerOptions(lista, null)).toEqual([])
  })
})
