import { describe, it, expect } from 'vitest'
import { buildTenantId, protheusErrorDetail } from '../protheus.client'

describe('protheusErrorDetail', () => {
  it('lê a mensagem dos campos de erro do Protheus', () => {
    expect(protheusErrorDetail({ errorCode: 403, errorMessage: 'Usuário sem permissão' })).toBe(
      'Usuário sem permissão'
    )
    expect(protheusErrorDetail({ code: 403, message: 'Method not found' })).toBe('Method not found')
    expect(
      protheusErrorDetail({ error: 'invalid_grant', error_description: 'Senha inválida' })
    ).toBe('Senha inválida')
  })

  it('texto puro sai sem HTML e sem espaço sobrando', () => {
    expect(protheusErrorDetail('<html><body><h1>403</h1>  Forbidden </body></html>')).toBe(
      '403 Forbidden'
    )
  })

  it('corta mensagem longa e ignora corpo sem mensagem', () => {
    expect(protheusErrorDetail('x'.repeat(300))).toBe(`${'x'.repeat(200)}…`)
    expect(protheusErrorDetail({ items: [] })).toBeNull()
    expect(protheusErrorDetail('')).toBeNull()
    expect(protheusErrorDetail(null)).toBeNull()
  })
})

describe('buildTenantId', () => {
  it('empresa e filial do cadastro, separadas por vírgula', () => {
    expect(buildTenantId('02', '01')).toBe('02,01')
    expect(buildTenantId(' 02 ', ' 01 ')).toBe('02,01')
  })

  it('sem um dos códigos, sem header', () => {
    expect(buildTenantId('02', null)).toBeNull()
    expect(buildTenantId(null, '01')).toBeNull()
    expect(buildTenantId('', '01')).toBeNull()
  })
})
