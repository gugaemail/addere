import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from '../url-validator'

describe('assertSafeUrl', () => {
  it('aceita URL https pública', async () => {
    await expect(assertSafeUrl('https://example.com/api', 'apiToken')).resolves.toBeUndefined()
  })

  it('rejeita protocolo não-HTTP', async () => {
    await expect(assertSafeUrl('ftp://example.com', 'apiToken')).rejects.toThrow(
      'protocolo não permitido'
    )
    await expect(assertSafeUrl('file:///etc/passwd', 'apiToken')).rejects.toThrow(
      'protocolo não permitido'
    )
  })

  it('rejeita URL malformada', async () => {
    await expect(assertSafeUrl('not-a-url', 'apiToken')).rejects.toThrow('URL inválida')
  })

  it('bloqueia localhost e loopback', async () => {
    await expect(assertSafeUrl('http://localhost:8080/x', 'apiToken')).rejects.toThrow(
      'endereço não permitido'
    )
    await expect(assertSafeUrl('http://127.0.0.1/x', 'apiToken')).rejects.toThrow(
      'endereço não permitido'
    )
  })

  it('bloqueia IPs privados RFC 1918', async () => {
    await expect(assertSafeUrl('http://10.0.0.5/x', 'url')).rejects.toThrow(
      'endereço não permitido'
    )
    await expect(assertSafeUrl('http://192.168.1.1/x', 'url')).rejects.toThrow(
      'endereço não permitido'
    )
    await expect(assertSafeUrl('http://172.16.0.1/x', 'url')).rejects.toThrow(
      'endereço não permitido'
    )
  })

  it('bloqueia o endpoint de metadados de cloud (alvo clássico de SSRF via redirect)', async () => {
    await expect(
      assertSafeUrl('http://169.254.169.254/latest/meta-data', 'redirect')
    ).rejects.toThrow('endereço não permitido')
  })
})
