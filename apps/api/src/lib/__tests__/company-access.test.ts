// Acesso da empresa (plano 017): a função pura que o authenticate e o
// /auth/me usam. Campo ausente nunca bloqueia; desativada tem precedência.
import { describe, it, expect } from 'vitest'
import { resolveCompanyAccess } from '../company-access'

const BLOCKED_AT = new Date('2026-10-25T12:00:00Z')

describe('resolveCompanyAccess', () => {
  it('empresa ausente (SUPERADMIN, mock sem empresa) não bloqueia', () => {
    expect(resolveCompanyAccess(null)).toEqual({ blocked: false, reason: null })
    expect(resolveCompanyAccess(undefined)).toEqual({ blocked: false, reason: null })
  })

  it('empresa sem o campo active (mock antigo) não bloqueia', () => {
    expect(resolveCompanyAccess({})).toEqual({ blocked: false, reason: null })
    expect(resolveCompanyAccess({ active: null })).toEqual({ blocked: false, reason: null })
  })

  it('empresa ativa e sem bloqueio passa', () => {
    expect(
      resolveCompanyAccess({ active: true, accessBlockedAt: null, accessBlockReason: null })
    ).toEqual({ blocked: false, reason: null })
  })

  it('empresa desativada é INACTIVE', () => {
    expect(resolveCompanyAccess({ active: false })).toEqual({ blocked: true, reason: 'INACTIVE' })
  })

  it('INACTIVE tem precedência sobre o bloqueio por atraso', () => {
    expect(
      resolveCompanyAccess({
        active: false,
        accessBlockedAt: BLOCKED_AT,
        accessBlockReason: 'OVERDUE',
      })
    ).toEqual({ blocked: true, reason: 'INACTIVE' })
  })

  it('bloqueio por atraso é OVERDUE', () => {
    expect(
      resolveCompanyAccess({
        active: true,
        accessBlockedAt: BLOCKED_AT,
        accessBlockReason: 'OVERDUE',
      })
    ).toEqual({ blocked: true, reason: 'OVERDUE' })
  })

  it('bloqueio sem motivo gravado vale OVERDUE (a regra o libera se não se sustentar)', () => {
    expect(
      resolveCompanyAccess({ active: true, accessBlockedAt: BLOCKED_AT, accessBlockReason: null })
    ).toEqual({ blocked: true, reason: 'OVERDUE' })
    expect(resolveCompanyAccess({ accessBlockedAt: BLOCKED_AT })).toEqual({
      blocked: true,
      reason: 'OVERDUE',
    })
  })

  it('MANUAL gravado à mão (reservado) é respeitado', () => {
    expect(
      resolveCompanyAccess({
        active: true,
        accessBlockedAt: BLOCKED_AT,
        accessBlockReason: 'MANUAL',
      })
    ).toEqual({ blocked: true, reason: 'MANUAL' })
  })

  it('motivo sem accessBlockedAt não bloqueia', () => {
    expect(resolveCompanyAccess({ active: true, accessBlockReason: 'OVERDUE' })).toEqual({
      blocked: false,
      reason: null,
    })
  })
})
