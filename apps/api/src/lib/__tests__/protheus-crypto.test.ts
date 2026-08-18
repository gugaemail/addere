import { describe, it, expect } from 'vitest'
import { encryptCredential, decryptCredential } from '../protheus-crypto'

describe('protheus-crypto', () => {
  it('cifra e decifra de volta ao valor original', () => {
    const secret = 'minha-senha-protheus'
    const encrypted = encryptCredential(secret)
    expect(encrypted).not.toBe(secret)
    expect(decryptCredential(encrypted)).toBe(secret)
  })

  it('gera ciphertexts diferentes para o mesmo valor (IV aleatório)', () => {
    const a = encryptCredential('senha')
    const b = encryptCredential('senha')
    expect(a).not.toBe(b)
    expect(decryptCredential(a)).toBe('senha')
    expect(decryptCredential(b)).toBe('senha')
  })

  it('suporta valores com caracteres especiais e acentos', () => {
    const secret = 'çã@#$%&*()_+ pão'
    expect(decryptCredential(encryptCredential(secret))).toBe(secret)
  })
})
