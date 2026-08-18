import { describe, it, expect, vi } from 'vitest'

// lib/api.ts cria o axios client no import e lê env — isola só a função pura
vi.mock('../../config/env', () => ({ env: { apiUrl: 'http://localhost:3333' } }))

import { getApiErrorMessage } from '../api'

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
