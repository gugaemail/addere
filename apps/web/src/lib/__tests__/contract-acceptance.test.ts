import { describe, it, expect } from 'vitest'
import { pendingBannerText, pendingDocumentMode } from '../contract-acceptance'

const maria = { id: 'maria', name: 'Maria Souza', valid: true }

describe('pendingDocumentMode', () => {
  it('o indicado aceita', () => {
    expect(pendingDocumentMode('maria', maria)).toBe('accept')
  })

  it('outro ADMIN só lê', () => {
    expect(pendingDocumentMode('joao', maria)).toBe('readonly')
  })

  it('sem indicado, ou indicado que deixou de ser ADMIN ativo: ninguém aceita', () => {
    expect(pendingDocumentMode('maria', null)).toBe('designee-invalid')
    expect(pendingDocumentMode('maria', undefined)).toBe('designee-invalid')
    expect(pendingDocumentMode('maria', { ...maria, valid: false })).toBe('designee-invalid')
    expect(pendingDocumentMode('joao', { ...maria, valid: false })).toBe('designee-invalid')
  })
})

describe('pendingBannerText', () => {
  it('contrato e aditivo, para o indicado', () => {
    expect(pendingBannerText('CONTRACT', 'accept', 'Maria Souza')).toBe(
      'Contrato aguardando seu aceite.'
    )
    expect(pendingBannerText('AMENDMENT', 'accept', 'Maria Souza')).toBe(
      'Aditivo aguardando seu aceite.'
    )
  })

  it('contrato e aditivo, para os outros ADMINs', () => {
    expect(pendingBannerText('CONTRACT', 'readonly', 'Maria Souza')).toBe(
      'Contrato aguardando o aceite de Maria Souza.'
    )
    expect(pendingBannerText('AMENDMENT', 'readonly', 'Maria Souza')).toBe(
      'Aditivo aguardando o aceite de Maria Souza.'
    )
  })

  it('indicado inválido', () => {
    expect(pendingBannerText('CONTRACT', 'designee-invalid', 'Maria Souza')).toBe(
      'O administrador indicado não está mais ativo. Fale com a Addere para indicar outro.'
    )
  })
})
