// Cliente HTTP para APIs Protheus com autenticação por token por empresa.
// O token é obtido via POST no endpoint `apiToken` e cacheado por 55 minutos.

import axios from 'axios'
import { assertSafeUrl } from '../../lib/url-validator'

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout de ${ms / 1000}s ao ${label}`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

async function getToken(companyId: string, creds: CompanyCredentials): Promise<string> {
  const cached = tokenCache.get(companyId)
  if (cached && cached.expiresAt > new Date()) return cached.token

  // OAuth2 password grant — envia como form-urlencoded (padrão Protheus)
  const params = new URLSearchParams()
  params.set('grant_type', 'password')
  params.set('username', creds.usrProtheus)
  params.set('password', creds.passProtheus)

  await assertSafeUrl(creds.apiToken, 'apiToken')

  const response = await withTimeout(
    axios.post(creds.apiToken, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
    15000,
    'obter token Protheus'
  )

  // Campo do token configurável via syncConfig.tokenField (padrão OAuth2: 'access_token')
  const tokenField = (creds.syncConfig?.tokenField as string | undefined) ?? 'access_token'
  const token = response.data[tokenField] as string | undefined

  if (!token) throw new Error(`Token não encontrado na resposta (campo esperado: "${tokenField}"). Campos recebidos: ${Object.keys(response.data as object).join(', ')}`)

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
  await assertSafeUrl(url, 'url')
  const token = await getToken(companyId, creds)
  const response = await withTimeout(
    axios.get(url, { headers: { Authorization: `Bearer ${token}` } }),
    30000,
    'buscar dados Protheus'
  )
  return response.data
}

export async function protheusPost(
  companyId: string,
  url: string,
  body: unknown,
  creds: CompanyCredentials
): Promise<unknown> {
  await assertSafeUrl(url, 'url')
  const token = await getToken(companyId, creds)
  const response = await withTimeout(
    axios.post(url, body, { headers: { Authorization: `Bearer ${token}` } }),
    30000,
    'enviar dados ao Protheus'
  )
  return response.data
}

// Invalida o cache de token de uma empresa (útil quando credenciais mudam)
export function invalidateToken(companyId: string): void {
  tokenCache.delete(companyId)
}
