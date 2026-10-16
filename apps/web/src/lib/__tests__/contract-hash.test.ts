import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256Hex } from '../contract-hash'

// O hash do navegador tem de bater com o da API (node:crypto), senão nenhum
// aceite passa: a API recusa com DOCUMENT_HASH_MISMATCH.
describe('sha256Hex', () => {
  it('vetor conhecido da string vazia', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('igual ao node:crypto num texto com acentos, R$ e travessão', async () => {
    const text = [
      '# CONTRATO DE LICENÇA DE USO DO ADDERE',
      '',
      '- **Valor:** R$ 1.500,00 (mil e quinhentos reais) — mensal',
      'Não é cobrança; ção, ã, é, ç, “aspas”, §3.6 e 99,5%',
    ].join('\n')
    const expected = createHash('sha256').update(text, 'utf8').digest('hex')
    expect(await sha256Hex(text)).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{64}$/)
  })
})
