import { describe, it, expect, vi } from 'vitest'

// lib/api.ts cria o axios client no import e lê env — isola só a função pura
vi.mock('../../config/env', () => ({ env: { apiUrl: 'http://localhost:3333' } }))

import { getApiErrorCode, getApiErrorMessage } from '../api'

describe('getApiErrorMessage', () => {
  it('extrai response.data.message de erros axios', () => {
    const err = { response: { data: { message: 'Empresa não encontrada' } } }
    expect(getApiErrorMessage(err)).toBe('Empresa não encontrada')
  })

  it('usa fallback quando não há mensagem estruturada', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('Erro inesperado')
    expect(getApiErrorMessage(null, 'Falhou')).toBe('Falhou')
    expect(getApiErrorMessage({ response: { data: {} } }, 'Falhou')).toBe('Falhou')
  })
})

describe('getApiErrorCode', () => {
  it('extrai response.data.code de erros axios', () => {
    const err = { response: { data: { message: 'CNPJ repetido', code: 'CNPJ_TAKEN' } } }
    expect(getApiErrorCode(err)).toBe('CNPJ_TAKEN')
  })

  it('null sem código estruturado', () => {
    expect(getApiErrorCode({ response: { data: { message: 'x' } } })).toBeNull()
    expect(getApiErrorCode({ response: { data: { code: 409 } } })).toBeNull()
    expect(getApiErrorCode({ response: { data: { code: null } } })).toBeNull()
    expect(getApiErrorCode(new Error('boom'))).toBeNull()
    expect(getApiErrorCode(null)).toBeNull()
  })
})
