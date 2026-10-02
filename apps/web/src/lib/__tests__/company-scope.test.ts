import { describe, expect, it } from 'vitest'
import { canOpenCompany, type CompanyScopeContext } from '../company-scope'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const ctx = (over: Partial<CompanyScopeContext> = {}): CompanyScopeContext => ({
  isSuperAdmin: false,
  isAdmin: false,
  companyId: null,
  targetId: A,
  ...over,
})

describe('canOpenCompany', () => {
  it('SUPERADMIN abre qualquer empresa', () => {
    expect(canOpenCompany(ctx({ isSuperAdmin: true }))).toBe(true)
    expect(canOpenCompany(ctx({ isSuperAdmin: true, targetId: B }))).toBe(true)
  })

  it('ADMIN abre a própria empresa', () => {
    expect(canOpenCompany(ctx({ isAdmin: true, companyId: A, targetId: A }))).toBe(true)
  })

  it('ADMIN não abre empresa de outro tenant', () => {
    expect(canOpenCompany(ctx({ isAdmin: true, companyId: A, targetId: B }))).toBe(false)
  })

  it('vendedor e gerente não abrem nem a própria', () => {
    expect(canOpenCompany(ctx({ companyId: A, targetId: A }))).toBe(false)
  })

  it('sem empresa na URL ou no usuário, não abre', () => {
    expect(canOpenCompany(ctx({ isAdmin: true, companyId: A, targetId: undefined }))).toBe(false)
    expect(canOpenCompany(ctx({ isAdmin: true, companyId: null, targetId: A }))).toBe(false)
  })

  it('companyId nulo dos dois lados não vira empresa aberta', () => {
    expect(canOpenCompany(ctx({ isAdmin: true, companyId: null, targetId: null }))).toBe(false)
  })
})
