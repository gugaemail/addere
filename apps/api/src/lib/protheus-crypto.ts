// Criptografia AES-256-GCM para credenciais Protheus armazenadas no banco.
// A chave deve ter 64 caracteres hex (32 bytes) em PROTHEUS_ENCRYPTION_KEY.
// Valores não criptografados (legado) são retornados sem alteração.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const ENCRYPTED_PREFIX = 'enc:'

function getKey(): Buffer {
  const hex = process.env.PROTHEUS_ENCRYPTION_KEY ?? ''
  if (hex.length !== 64) {
    throw new Error(
      'PROTHEUS_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes). ' +
        'Gere com: openssl rand -hex 32'
    )
  }
  if (/^0+$/.test(hex)) {
    throw new Error(
      'PROTHEUS_ENCRYPTION_KEY não pode ser todos zeros. ' +
        'Gere uma chave segura com: openssl rand -hex 32'
    )
  }
  return Buffer.from(hex, 'hex')
}

/** Criptografa um valor. Retorna string no formato enc:<iv>:<authTag>:<ciphertext> */
export function encryptCredential(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96 bits — padrão GCM
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descriptografa um valor criptografado.
 * Se o valor não começar com "enc:" (legado/plaintext), retorna como está.
 */
export function decryptCredential(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value // compatibilidade legado

  const rest = value.slice(ENCRYPTED_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length !== 3) throw new Error('Formato de credencial inválido')

  const [ivHex, authTagHex, encryptedHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encryptedBuf = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encryptedBuf).toString('utf8') + decipher.final('utf8')
}

/** Retorna true se o valor está criptografado */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX)
}
