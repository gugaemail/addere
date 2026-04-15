// Valida URLs de endpoints Protheus para evitar SSRF (Server-Side Request Forgery).
// Bloqueia IPs privados, loopback e metadados de cloud antes de qualquer chamada HTTP.

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

/**
 * Lança erro se a URL não for HTTP/HTTPS ou apontar para endereços bloqueados.
 * Chame antes de qualquer axios.get/post com URL vinda do banco.
 */
export function assertSafeUrl(url: string, field: string): void {
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

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error(`${field}: endereço não permitido — "${hostname}"`)
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`${field}: endereço IP privado/reservado não permitido — "${hostname}"`)
    }
  }
}
