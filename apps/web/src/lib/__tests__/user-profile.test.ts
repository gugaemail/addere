// "Gerente" é vendedor + intel.manager, não um valor do enum Role (D3).
import { describe, expect, it } from 'vitest'
import {
  SELECTABLE_PROFILES,
  hasVendorProfile,
  profileLabel,
  profileOf,
  profileToPayload,
  type Profile,
} from '../user-profile'

describe('profileOf', () => {
  it('vendedor com intel.manager é gerente', () => {
    expect(profileOf({ role: 'SALESPERSON', intelManager: true })).toBe('MANAGER')
    expect(profileLabel({ role: 'SALESPERSON', intelManager: true })).toBe('Gerente')
  })

  it('vendedor sem a permissão é vendedor', () => {
    expect(profileOf({ role: 'SALESPERSON', intelManager: false })).toBe('SALESPERSON')
    expect(profileOf({ role: 'SALESPERSON' })).toBe('SALESPERSON')
  })

  it('administrador continua administrador mesmo com a permissão', () => {
    // intel.manager num ADMIN não muda o que ele é — ele já vê tudo
    expect(profileOf({ role: 'ADMIN', intelManager: true })).toBe('ADMIN')
  })

  it('superadmin tem rótulo próprio', () => {
    expect(profileLabel({ role: 'SUPERADMIN' })).toBe('Super administrador')
  })
})

describe('profileToPayload', () => {
  it('gerente grava vendedor + a permissão, nunca admin', () => {
    expect(profileToPayload('MANAGER')).toEqual({ role: 'SALESPERSON', intelManager: true })
  })

  it('administrador não ganha intel.manager de brinde', () => {
    expect(profileToPayload('ADMIN')).toEqual({ role: 'ADMIN', intelManager: false })
  })

  it('vendedor é o caso simples', () => {
    expect(profileToPayload('SALESPERSON')).toEqual({ role: 'SALESPERSON', intelManager: false })
  })
})

describe('ida e volta', () => {
  it('gravar e derivar de novo devolve o mesmo perfil', () => {
    for (const profile of SELECTABLE_PROFILES) {
      expect(profileOf(profileToPayload(profile))).toBe(profile)
    }
  })
})

describe('hasVendorProfile', () => {
  it('só o vendedor tem carteira', () => {
    expect(hasVendorProfile('SALESPERSON')).toBe(true)
    expect(hasVendorProfile('ADMIN')).toBe(false)
  })

  it('gerente não tem carteira — ele acompanha quem tem', () => {
    // A associação é do lado do vendedor (campo Gerente); o gerente não vende,
    // então não tem código Protheus, visitas por dia nem cidades atendidas.
    expect(hasVendorProfile('MANAGER')).toBe(false)
  })
})

describe('SELECTABLE_PROFILES', () => {
  it('não oferece superadmin no cadastro', () => {
    expect(SELECTABLE_PROFILES).not.toContain('SUPERADMIN' as Profile)
  })
})
