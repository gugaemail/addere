// Valida URLs de endpoints Protheus para evitar SSRF (Server-Side Request Forgery).
// Bloqueia IPs privados, loopback e metadados de cloud antes de qualquer chamada HTTP.
// Inclui resolução DNS para prevenir DNS rebinding.

import { promises as dns } from 'dns'

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.internal',       // GCP
  '169.254.169.254',         // AWS/Azure/GCP IMDS
  '[::1]',
])

// Prefixos de IP privado/reservado em notação decimal
const PRIVATE_IP_PATTERNS = [
  /^127\./,                  // loopback
  /^10\./,                   // RFC 1918
  /^192\.168\./,             // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 172.16–172.31
  /^169\.254\./,             // link-local / IMDS
  /^::1$/,                   // IPv6 loopback
  /^fc00:/,                  // IPv6 unique local
  /^fd/,                     // IPv6 unique local
]

function isBlockedAddress(addr: string): boolean {
  const lower = addr.toLowerCase()
  if (BLOCKED_HOSTS.has(lower)) return true
  return PRIVATE_IP_PATTERNS.some((p) => p.test(lower))
}

/**
 * Lança erro se a URL não for HTTP/HTTPS ou apontar para endereços bloqueados.
 * Resolve o hostname via DNS para prevenir DNS rebinding.
 * Chame antes de qualquer axios.get/post com URL vinda do banco.
 */
export async function assertSafeUrl(url: string, field: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${field}: URL inválida — "${url}"`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${field}: protocolo não permitido (use http ou https)`)
  }

  const hostname = parsed.hostname.toLowerCase()

  // Verificação estática do hostname (captura IPs privados literais e hostnames bloqueados)
  if (isBlockedAddress(hostname)) {
    throw new Error(`${field}: endereço não permitido — "${hostname}"`)
  }

  // Resolução DNS: detecta DNS rebinding (hostname público → IP privado)
  try {
    const { address } = await dns.lookup(hostname)
    if (isBlockedAddress(address)) {
      throw new Error(`${field}: hostname resolve para endereço privado/reservado — "${address}"`)
    }
  } catch (err) {
    // Re-lança apenas erros de validação (não erros de rede/DNS)
    if (err instanceof Error && err.message.startsWith(field + ':')) throw err
    // Falha de resolução DNS: deixa o axios lidar com o erro naturalmente
  }
}
