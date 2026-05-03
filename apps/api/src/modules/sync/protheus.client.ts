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
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Connection': 'close',
      },
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

function enrichAxiosError(err: unknown, url: string): never {
  const e = err as { response?: { status: number; data: unknown }; message: string }
  if (e.response) {
    const detail = typeof e.response.data === 'object'
      ? JSON.stringify(e.response.data)
      : String(e.response.data ?? '')
    throw new Error(`Protheus ${e.response.status} em ${url}${detail ? ': ' + detail : ''}`)
  }
  throw err as Error
}

export async function protheusGet(
  companyId: string,
  url: string,
  creds: CompanyCredentials
): Promise<unknown> {
  await assertSafeUrl(url, 'url')
  const token = await getToken(companyId, creds)
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}`, 'Connection': 'close' },
      timeout: 60000,
    })
    return response.data
  } catch (err) {
    return enrichAxiosError(err, url)
  }
}

export async function protheusPost(
  companyId: string,
  url: string,
  body: unknown,
  creds: CompanyCredentials
): Promise<unknown> {
  await assertSafeUrl(url, 'url')
  const token = await getToken(companyId, creds)

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Connection': 'close',
  }

  try {
    // maxRedirects:0 + validateStatus<400 para capturar 3xx manualmente e re-enviar como POST.
    // O axios converte POST→GET ao seguir 301/302 (RFC padrão), o que quebra APIs Protheus.
    const response = await axios.post(url, body, {
      headers,
      timeout: 60000,
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
    })

    if (response.status >= 300) {
      const location = response.headers['location'] as string | undefined
      if (!location) throw new Error(`Redirect ${response.status} sem header Location`)
      await assertSafeUrl(location, 'redirect url')
      const r2 = await axios.post(location, body, { headers, timeout: 60000 })
      return r2.data
    }

    return response.data
  } catch (err) {
    return enrichAxiosError(err, url)
  }
}

// Invalida o cache de token de uma empresa (útil quando credenciais mudam)
export function invalidateToken(companyId: string): void {
  tokenCache.delete(companyId)
}
