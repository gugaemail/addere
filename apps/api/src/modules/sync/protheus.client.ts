// Cliente HTTP para APIs Protheus com autenticação por token por empresa.
// O token é obtido via POST no endpoint `apiToken` e cacheado por 55 minutos.

import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { assertSafeUrl } from '../../lib/url-validator'

interface TokenCache {
  token: string
  expiresAt: Date
}

// Cache em memória: companyId → token + expiração
const tokenCache = new Map<string, TokenCache>()

export interface CompanyCredentials {
  apiToken: string // URL do endpoint de autenticação
  usrProtheus: string
  passProtheus: string
  syncConfig?: Record<string, unknown> | null
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout de ${ms / 1000}s ao ${label}`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
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

  if (!token)
    throw new Error(
      `Token não encontrado na resposta (campo esperado: "${tokenField}"). Campos recebidos: ${Object.keys(response.data as object).join(', ')}`
    )

  // Cache por 55 minutos (tokens Protheus geralmente expiram em 1h)
  tokenCache.set(companyId, {
    token,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000),
  })

  return token
}

// POST com seguimento de redirect como POST.
// O axios converte POST→GET em redirects 301/302 (RFC padrão), quebrando endpoints
// Protheus que redirecionam (ex: WSCLI→wscli). O módulo nativo http/https
// nos dá controle total sobre o comportamento do redirect.
async function postJson(
  urlStr: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  hopsLeft = 5
): Promise<unknown> {
  const bodyBuf = Buffer.from(JSON.stringify(body), 'utf-8')

  return new Promise<unknown>((resolve, reject) => {
    let u: URL
    try {
      u = new URL(urlStr)
    } catch {
      return reject(new Error(`URL inválida: ${urlStr}`))
    }

    const client = u.protocol === 'https:' ? https : http
    const req = client.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { ...headers, 'Content-Length': bodyBuf.length },
      },
      (res) => {
        // Segue redirect como POST (301/302 normalmente convertem para GET no axios)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume() // descarta body do redirect
          if (hopsLeft <= 0) return reject(new Error(`Muitos redirects em ${urlStr}`))
          const loc = res.headers.location
          if (!loc) return reject(new Error(`Redirect sem Location em ${urlStr}`))
          // Revalida o destino do redirect — sem isso um 302 para IP privado contorna o anti-SSRF
          const nextUrl = new URL(loc, urlStr).href
          assertSafeUrl(nextUrl, 'redirect')
            .then(() => postJson(nextUrl, body, headers, timeoutMs, hopsLeft - 1))
            .then(resolve, reject)
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          clearTimeout(timer)
          const raw = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode && res.statusCode >= 400) {
            let data: unknown = raw
            try {
              data = JSON.parse(raw)
            } catch {
              /* mantém string */
            }
            return reject(
              Object.assign(new Error(`Protheus ${res.statusCode} em ${urlStr}`), {
                response: { status: res.statusCode, data },
              })
            )
          }
          try {
            resolve(JSON.parse(raw))
          } catch {
            resolve(raw)
          }
        })
        res.on('error', (e) => {
          clearTimeout(timer)
          reject(e)
        })
      }
    )

    const timer = setTimeout(
      () => req.destroy(new Error(`Timeout de ${timeoutMs / 1000}s em ${urlStr}`)),
      timeoutMs
    )
    req.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    req.write(bodyBuf)
    req.end()
  })
}

// Campos onde o Protheus (FWRest, SetRestFault, OAuth2) põe a mensagem do erro
const ERROR_TEXT_FIELDS = [
  'errorMessage',
  'message',
  'error_description',
  'detailedMessage',
  'error',
]
const MAX_ERROR_DETAIL = 200

/**
 * O texto curto do erro que o Protheus devolveu ("usuário sem permissão",
 * "método não encontrado"...), sem o corpo inteiro: só os campos de mensagem
 * conhecidos ou, se o corpo for texto, o começo dele, sem HTML.
 */
export function protheusErrorDetail(data: unknown): string | null {
  let text: string | null = null
  if (typeof data === 'string') {
    text = data.replace(/<[^>]*>/g, ' ')
  } else if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const field = ERROR_TEXT_FIELDS.find((key) => typeof record[key] === 'string' && record[key])
    if (field) text = record[field] as string
  }
  const clean = text?.replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.length > MAX_ERROR_DETAIL ? `${clean.slice(0, MAX_ERROR_DETAIL)}…` : clean
}

function enrichError(err: unknown, url: string): never {
  const e = err as { response?: { status: number; data: unknown }; message: string }
  if (e.response) {
    // Só a mensagem curta do ERP entra no texto (protheusErrorDetail), nunca o
    // corpo inteiro: o texto aparece no log de chamadas e na tela de teste, e
    // sem ele um 403 não dizia se era permissão, caminho ou outra coisa
    const detail = protheusErrorDetail(e.response.data)
    throw Object.assign(
      new Error(`Protheus ${e.response.status} em ${url}${detail ? ` — ${detail}` : ''}`),
      { response: e.response }
    )
  }
  throw err as Error
}

export interface ProtheusPostOptions {
  /** Timeout da requisição em ms (default 60s) — prévia usa 30s, backfill usa mais (E2) */
  timeoutMs?: number
}

export async function protheusPost(
  companyId: string,
  url: string,
  body: unknown,
  creds: CompanyCredentials,
  opts: ProtheusPostOptions = {},
  isRetry = false
): Promise<unknown> {
  await assertSafeUrl(url, 'url')
  const token = await getToken(companyId, creds)
  try {
    return await postJson(
      url,
      body,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      opts.timeoutMs ?? 60000
    )
  } catch (err) {
    const e = err as { code?: string; message?: string; response?: { status?: number } }
    // Token cacheado pode ter sido revogado antes dos 55 min — renova e retenta uma vez
    if (e.response?.status === 401 && !isRetry) {
      invalidateToken(companyId)
      return protheusPost(companyId, url, body, creds, opts, true)
    }
    if (e.code === 'ECONNRESET' || e.message === 'socket hang up') {
      throw new Error(
        'Protheus encerrou a conexão sem responder. Verifique os logs do servidor Protheus (possível campo inválido ou erro interno).',
        { cause: err }
      )
    }
    return enrichError(err, url)
  }
}

// Invalida o cache de token de uma empresa (útil quando credenciais mudam)
export function invalidateToken(companyId: string): void {
  tokenCache.delete(companyId)
}
