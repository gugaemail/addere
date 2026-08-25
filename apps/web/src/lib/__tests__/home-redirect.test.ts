import { describe, expect, it } from 'vitest'
import { canAccessPanel, hasIntelPermission, resolveHome, safeNextPath } from '../home-redirect'

describe('hasIntelPermission', () => {
  it('detecta qualquer permissão intel.*', () => {
    expect(hasIntelPermission(['intel.admin'])).toBe(true)
    expect(hasIntelPermission(['orders.view', 'intel.manager'])).toBe(true)
    expect(hasIntelPermission(['orders.view'])).toBe(false)
    expect(hasIntelPermission([])).toBe(false)
    expect(hasIntelPermission(undefined)).toBe(false)
  })
})

describe('canAccessPanel', () => {
  it('SUPERADMIN e ADMIN entram sempre', () => {
    expect(canAccessPanel({ role: 'SUPERADMIN' })).toBe(true)
    expect(canAccessPanel({ role: 'ADMIN', permissions: [] })).toBe(true)
  })

  it('vendedor/gerente entra só com permissão intel.*', () => {
    expect(canAccessPanel({ role: 'SALESPERSON', permissions: ['intel.manager'] })).toBe(true)
    expect(canAccessPanel({ role: 'SALESPERSON', permissions: ['orders.view'] })).toBe(false)
    expect(canAccessPanel({ role: 'SALESPERSON' })).toBe(false)
  })
})

describe('resolveHome', () => {
  it('SUPERADMIN cai nas Empresas; demais na Inteligência', () => {
    expect(resolveHome({ role: 'SUPERADMIN' })).toBe('/dashboard')
    expect(resolveHome({ role: 'ADMIN' })).toBe('/inteligencia')
    expect(resolveHome({ role: 'SALESPERSON', permissions: ['intel.manager'] })).toBe('/inteligencia')
  })
})

describe('safeNextPath', () => {
  it('aceita caminho interno com query', () => {
    expect(safeNextPath('/inteligencia/saude')).toBe('/inteligencia/saude')
    expect(safeNextPath('/empresas/123?tab=intel')).toBe('/empresas/123?tab=intel')
  })

  it('recusa destino externo (open redirect)', () => {
    expect(safeNextPath('https://evil.test/phish')).toBeNull()
    expect(safeNextPath('//evil.test/phish')).toBeNull()
    expect(safeNextPath('/\\evil.test')).toBeNull()
  })

  it('recusa páginas públicas e vazio', () => {
    expect(safeNextPath('/login')).toBeNull()
    expect(safeNextPath('/resetar-senha?token=x')).toBeNull()
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath('')).toBeNull()
  })
})
