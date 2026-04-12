// Cliente HTTP para APIs Protheus com autenticação por token por empresa.
// O token é obtido via POST no endpoint `apiToken` e cacheado por 55 minutos.

import axios from 'axios'

interface TokenCache {
  token: string
  expiresAt: Date
}

// Cache em memória: companyId → token + expiração
const tokenCache = new Map<string, TokenCache>()

export interface CompanyCredentials {
  apiToken:     string  // URL do endpoint de autenticação
  usrProtheus:  string
  passProtheus: string
  syncConfig?:  Record<string, unknown> | null
}

async function getToken(companyId: string, creds: CompanyCredentials): Promise<string> {
  const cached = tokenCache.get(companyId)
  if (cached && cached.expiresAt > new Date()) return cached.token

  // OAuth2 password grant — envia como form-urlencoded (padrão Protheus)
  const params = new URLSearchParams()
  params.set('grant_type', 'password')
  params.set('username', creds.usrProtheus)
  params.set('password', creds.passProtheus)

  const response = await axios.post(creds.apiToken, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  // Campo do token configurável via syncConfig.tokenField (padrão OAuth2: 'access_token')
  const tokenField = (creds.syncConfig?.tokenField as string | undefined) ?? 'access_token'
  const token = response.data[tokenField] as string | undefined

  if (!token) throw new Error(`Token não encontrado na resposta (campo esperado: "${tokenField}")`)

  // Cache por 55 minutos (tokens Protheus geralmente expiram em 1h)
  tokenCache.set(companyId, {
    token,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000),
  })

  return token
}

export async function protheusGet(
  companyId: string,
  url: string,
  creds: CompanyCredentials
): Promise<unknown> {
  const token = await getToken(companyId, creds)
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export async function protheusPost(
  companyId: string,
  url: string,
  body: unknown,
  creds: CompanyCredentials
): Promise<unknown> {
  const token = await getToken(companyId, creds)
  const response = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

// Invalida o cache de token de uma empresa (útil quando credenciais mudam)
export function invalidateToken(companyId: string): void {
  tokenCache.delete(companyId)
}
