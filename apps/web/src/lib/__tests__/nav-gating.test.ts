import { describe, expect, it } from 'vitest'
import { canSeeNavItem, filterNavGroups, type NavGateContext } from '../nav-gating'

const ctx = (over: Partial<NavGateContext> = {}): NavGateContext => ({
  isSuperAdmin: false,
  isAdmin: false,
  hasPermission: () => false,
  ...over,
})

describe('canSeeNavItem', () => {
  it('sem requires, todo mundo vê', () => {
    expect(canSeeNavItem(undefined, ctx())).toBe(true)
  })

  it("'superadmin' só para SUPERADMIN", () => {
    expect(canSeeNavItem('superadmin', ctx({ isSuperAdmin: true }))).toBe(true)
    expect(canSeeNavItem('superadmin', ctx({ isAdmin: true }))).toBe(false)
  })

  it("'admin' inclui SUPERADMIN", () => {
    expect(canSeeNavItem('admin', ctx({ isAdmin: true }))).toBe(true)
    expect(canSeeNavItem('admin', ctx({ isSuperAdmin: true }))).toBe(true)
    expect(canSeeNavItem('admin', ctx())).toBe(false)
  })

  it('permission única ou lista (basta uma)', () => {
    const gerente = ctx({ hasPermission: (k) => k === 'intel.manager' })
    expect(canSeeNavItem({ permission: 'intel.manager' }, gerente)).toBe(true)
    expect(canSeeNavItem({ permission: ['intel.admin', 'intel.manager'] }, gerente)).toBe(true)
    expect(canSeeNavItem({ permission: 'intel.admin' }, gerente)).toBe(false)
  })

  it('orAdmin abre o item por papel mesmo sem a permissão (home do ADMIN)', () => {
    const adminSemIntel = ctx({ isAdmin: true })
    expect(
      canSeeNavItem({ permission: ['intel.admin', 'intel.manager'], orAdmin: true }, adminSemIntel)
    ).toBe(true)
    expect(canSeeNavItem({ permission: 'intel.admin', orAdmin: true }, ctx())).toBe(false)
  })

  it('SUPERADMIN passa por qualquer permission', () => {
    expect(canSeeNavItem({ permission: 'intel.admin' }, ctx({ isSuperAdmin: true }))).toBe(true)
  })
})

describe('filterNavGroups', () => {
  const groups = [
    { title: 'Operação', items: [{ requires: 'admin' as const }] },
    { title: 'Inteligência', items: [{ requires: { permission: ['intel.admin', 'intel.manager'] } }] },
    { title: 'Empresa', items: [{ requires: 'superadmin' as const }, { requires: 'superadmin' as const }] },
  ]

  it('SUPERADMIN vê tudo', () => {
    const result = filterNavGroups(groups, ctx({ isSuperAdmin: true }))
    expect(result.map((g) => g.title)).toEqual(['Operação', 'Inteligência', 'Empresa'])
  })

  it('ADMIN com intel.admin vê Operação e Inteligência (grupo Empresa some)', () => {
    const admin = ctx({ isAdmin: true, hasPermission: (k) => k === 'intel.admin' })
    const result = filterNavGroups(groups, admin)
    expect(result.map((g) => g.title)).toEqual(['Operação', 'Inteligência'])
  })

  it('gerente (intel.manager) vê só Inteligência', () => {
    const gerente = ctx({ hasPermission: (k) => k === 'intel.manager' })
    const result = filterNavGroups(groups, gerente)
    expect(result.map((g) => g.title)).toEqual(['Inteligência'])
  })

  it('sem permissão nenhuma, lista vazia', () => {
    expect(filterNavGroups(groups, ctx())).toEqual([])
  })
})
