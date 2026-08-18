import { protheusPost, CompanyCredentials } from './protheus.client'
import { toNum } from './utils'

const PAGE_SIZE = 50
const MAX_PAGES = 500 // segurança contra loop infinito

export interface PaginatedFetchOptions<T> {
  companyId: string
  url:       string
  creds:     CompanyCredentials
  /** Chave do array de registros na resposta (ex: 'produtos', 'clientes', 'Transportadoras', 'condpag') */
  listKey:   string
  /** Campos extras enviados em cada página (ex: B2_FILIAL, INTERV) */
  bodyExtra?: Record<string, unknown>
  /** Converte um registro bruto; retorna null para descartar */
  mapRecord: (raw: Record<string, unknown>) => T | null
}

/**
 * Loop de paginação padrão das APIs Protheus: deslocamento 1-based,
 * total em paginas.total, encerra na última página ou ao atingir o total.
 * Única implementação — antes havia quatro cópias deste loop.
 */
export async function fetchPaginated<T>(opts: PaginatedFetchOptions<T>): Promise<{
  records: T[]
  totalRecords: number
  totalFetched: number
}> {
  const records: T[] = []
  let totalRecords = 0
  let totalFetched = 0
  let deslocamento = 1

  while (deslocamento <= MAX_PAGES) {
    const body = { limite: PAGE_SIZE, deslocamento, INTERV: 0, ...opts.bodyExtra }
    const raw = await protheusPost(opts.companyId, opts.url, body, opts.creds) as Record<string, unknown>

    const paginas = (raw['paginas'] ?? {}) as Record<string, unknown>
    const list = Array.isArray(raw[opts.listKey]) ? raw[opts.listKey] as Record<string, unknown>[] : []

    if (deslocamento === 1) totalRecords = toNum(paginas['total'])
    if (list.length === 0) break

    for (const item of list) {
      const mapped = opts.mapRecord(item)
      if (mapped !== null) records.push(mapped)
    }

    totalFetched += list.length
    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (list.length < PAGE_SIZE) break
    deslocamento += 1
  }

  return { records, totalRecords, totalFetched }
}
