import { prisma } from '@addere/db'
import { protheusGet, protheusPost, CompanyCredentials } from './protheus.client'
import { mapRecord, extractRecords, toStr, toNum } from './field-mapper'
import { DEFAULT_MAPPINGS } from './default-mappings'
import { decryptCredential } from '../../lib/protheus-crypto'


// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCredentials(company: {
  apiToken:     string | null
  usrProtheus:  string | null
  passProtheus: string | null
  syncConfig:   unknown
}): CompanyCredentials {
  if (!company.apiToken)     throw new Error('URL apiToken não configurada')
  if (!company.usrProtheus)  throw new Error('Usuário Protheus não configurado')
  if (!company.passProtheus) throw new Error('Senha Protheus não configurada')

  return {
    apiToken:     company.apiToken,
    usrProtheus:  company.usrProtheus,
    // Descriptografa a senha antes de usar na chamada HTTP
    passProtheus: decryptCredential(company.passProtheus),
    syncConfig:   company.syncConfig as Record<string, unknown> | null,
  }
}

// ─── Sync Produtos ────────────────────────────────────────────────────────────

const SYNC_PRODUCTS_PAGE_SIZE = 50

type ProductData = {
  protheusCode: string
  name: string
  price: number
  unit: string
  stock: number
  saldo: number
}

/** Tenta parsear um campo que pode ser string JSON ou já um objeto */
function parseJsonField(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown> } catch { return {} }
  }
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  return {}
}

export async function syncProducts(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { branches: { where: { active: true }, take: 1 } },
  })

  if (!company.apiPord) throw new Error('URL apiPord não configurada')

  const branch = company.branches[0]
  if (!branch) throw new Error('Nenhuma filial ativa encontrada para a empresa')
  if (!branch.idProtheus) throw new Error('Filial sem código Protheus configurado')

  const filial = branch.idProtheus
  const creds  = getCredentials(company)
  const errors: string[] = []
  const validRecords: ProductData[] = []

  let deslocamento = 1
  let totalRecords = 0
  let totalFetched = 0
  const MAX_PAGES  = 500 // segurança contra loop infinito

  // Loop de paginação: deslocamento é número de página (1-based)
  while (deslocamento <= MAX_PAGES) {
    const body = {
      limite:      SYNC_PRODUCTS_PAGE_SIZE,
      deslocamento,
      B2_FILIAL:   filial,
      DA1_FILIAL:  filial,
      INTERV:      0,
    }

    const rawResponse = await protheusPost(companyId, company.apiPord, body, creds) as Record<string, unknown>

    // Extrai paginação e lista de produtos do retorno
    const paginas  = (rawResponse['paginas']  ?? {}) as Record<string, unknown>
    const produtos = Array.isArray(rawResponse['produtos']) ? rawResponse['produtos'] as Record<string, unknown>[] : []

    if (deslocamento === 1) {
      totalRecords = toNum(paginas['total'])
    }

    if (produtos.length === 0) break

    for (const raw of produtos) {
      const protheusCode = toStr(raw['id'])
      if (!protheusCode) continue

      const precoObj   = parseJsonField(raw['preco'])
      const estoqueObj = parseJsonField(raw['estoque'])

      const price = toNum(precoObj['atual'])
      const stock = toNum(estoqueObj['quantidade'])

      validRecords.push({
        protheusCode,
        name:  toStr(raw['nome'], protheusCode),
        price: Number.isFinite(price) ? price : 0,
        unit:  'UN',
        stock: Number.isFinite(stock) ? stock : 0,
        saldo: Number.isFinite(stock) ? stock : 0,
      })
    }

    totalFetched += produtos.length

    // Encerra quando buscou todos os registros informados pelo total,
    // ou quando recebeu menos que o limite (última página)
    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (produtos.length < SYNC_PRODUCTS_PAGE_SIZE) break

    deslocamento += 1 // avança para a próxima página
  }

  // Executa upserts em chunks para evitar transações com milhares de operações
  const CHUNK_SIZE = 500
  let synced = 0

  for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
    const chunk = validRecords.slice(i, i + CHUNK_SIZE)
    const results = await prisma.$transaction(
      chunk.map((p) =>
        prisma.product.upsert({
          where: { companyId_protheusCode: { companyId, protheusCode: p.protheusCode } },
          update: {
            name:   p.name,
            price:  p.price,
            unit:   p.unit,
            stock:  p.stock,
            saldo:  p.saldo,
            active: true,
          },
          create: {
            companyId,
            protheusCode: p.protheusCode,
            name:         p.name,
            price:        p.price,
            unit:         p.unit,
            stock:        p.stock,
            saldo:        p.saldo,
          },
        })
      )
    )
    synced += results.length
  }

  return { synced, total: totalRecords || validRecords.length, errors }
}

// ─── Sync Clientes ────────────────────────────────────────────────────────────

const SYNC_CUSTOMERS_PAGE_SIZE = 100
const UPSERT_CHUNK_SIZE = 500

type CustomerData = {
  protheusCode: string
  loja:         string
  name:         string
  document:     string | null
  email:        string | null
  phone:        string | null
  address:      string | null
  municipio:    string | null
  bairro:       string | null
  cep:          string | null
  uf:           string | null
}

async function upsertOne(companyId: string, c: CustomerData): Promise<void> {
  await prisma.customer.upsert({
    where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
    update: {
      name:      c.name,
      document:  c.document,
      email:     c.email,
      phone:     c.phone,
      address:   c.address,
      municipio: c.municipio,
      bairro:    c.bairro,
      cep:       c.cep,
      uf:        c.uf,
      active:    true,
    },
    create: {
      companyId,
      protheusCode: c.protheusCode,
      loja:         c.loja,
      name:         c.name,
      document:     c.document,
      email:        c.email,
      phone:        c.phone,
      address:      c.address,
      municipio:    c.municipio,
      bairro:       c.bairro,
      cep:          c.cep,
      uf:           c.uf,
    },
  })
}

async function upsertCustomersChunked(
  companyId: string,
  records: CustomerData[]
): Promise<{ synced: number; errors: string[] }> {
  let synced = 0
  const errors: string[] = []

  for (let i = 0; i < records.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = records.slice(i, i + UPSERT_CHUNK_SIZE)
    try {
      // Tentativa rápida: todos os registros do chunk em uma transação
      await prisma.$transaction(chunk.map((c) => prisma.customer.upsert({
        where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
        update: {
          name:      c.name,
          document:  c.document,
          email:     c.email,
          phone:     c.phone,
          address:   c.address,
          municipio: c.municipio,
          bairro:    c.bairro,
          cep:       c.cep,
          uf:        c.uf,
          active:    true,
        },
        create: {
          companyId,
          protheusCode: c.protheusCode,
          loja:         c.loja,
          name:         c.name,
          document:     c.document,
          email:        c.email,
          phone:        c.phone,
          address:      c.address,
          municipio:    c.municipio,
          bairro:       c.bairro,
          cep:          c.cep,
          uf:           c.uf,
        },
      })))
      synced += chunk.length
    } catch (chunkErr: unknown) {
      // Fallback individual: salva o máximo possível e coleta erros por registro.
      // Necessário quando clientes multi-loja compartilham o mesmo CNPJ (P2002 em @@unique([companyId, document])).
      for (const c of chunk) {
        try {
          await upsertOne(companyId, c)
          synced++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro desconhecido'
          errors.push(`${c.protheusCode}/${c.loja}: ${msg}`)
        }
      }
    }
  }

  return { synced, errors }
}

export async function syncCustomers(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCliente) throw new Error('URL apiCliente não configurada')

  const creds  = getCredentials(company)
  const config = creds.syncConfig as Record<string, unknown> | null
  const mapping = (config?.customers as typeof DEFAULT_MAPPINGS.customers | undefined) ?? DEFAULT_MAPPINGS.customers

  const custMethod    = (config?.customers as Record<string, unknown> | undefined)?.method as string | undefined
  const custBody      = (config?.customers as Record<string, unknown> | undefined)?.body as Record<string, unknown> | undefined ?? {}
  const pageKey       = (config?.customers as Record<string, unknown> | undefined)?.pageKey as string | undefined ?? 'deslocamento'
  const limitKey      = (config?.customers as Record<string, unknown> | undefined)?.limitKey as string | undefined ?? 'limite'
  const isPaginated   = custMethod === 'POST'
  const MAX_PAGES     = 500

  const validRecords: CustomerData[] = []
  let totalFetched = 0
  let deslocamento = 1

  // Paginação: suportada quando método é POST (mesmo padrão de syncProducts)
  while (deslocamento <= MAX_PAGES) {
    let rawResponse: unknown
    if (isPaginated) {
      const body = { ...custBody, [limitKey]: SYNC_CUSTOMERS_PAGE_SIZE, [pageKey]: deslocamento }
      rawResponse = await protheusPost(companyId, company.apiCliente, body, creds)
    } else {
      rawResponse = await protheusGet(companyId, company.apiCliente, creds)
    }

    const records = extractRecords(rawResponse, mapping.responseKey)
    if (records.length === 0) break

    for (const raw of records) {
      const mapped = mapRecord(raw, mapping.fields)
      const protheusCode = toStr(mapped['protheusCode'])
      if (!protheusCode) continue
      const loja = toStr(mapped['loja'], '01')
      validRecords.push({
        protheusCode,
        loja,
        name:      toStr(mapped['name'], protheusCode),
        document:  toStr(mapped['document'])  || null,
        email:     toStr(mapped['email'])     || null,
        phone:     toStr(mapped['phone'])     || null,
        address:   toStr(mapped['address'])   || null,
        municipio: toStr(mapped['municipio']) || null,
        bairro:    toStr(mapped['bairro'])    || null,
        cep:       toStr(mapped['cep'])       || null,
        uf:        toStr(mapped['uf'])        || null,
      })
    }

    totalFetched += records.length

    // Se não é paginado ou recebeu menos que o limite, encerra
    if (!isPaginated || records.length < SYNC_CUSTOMERS_PAGE_SIZE) break

    deslocamento += 1
  }

  // Deduplica por document: o Protheus pode retornar o mesmo CNPJ em múltiplas lojas
  // (A1_LOJA='01', '02'...). A constraint @@unique([companyId, document]) aceita apenas um
  // registro por CNPJ — mantemos a primeira ocorrência (geralmente loja='01').
  const seenDocuments = new Set<string>()
  const deduped = validRecords.filter((c) => {
    if (!c.document) return true
    if (seenDocuments.has(c.document)) return false
    seenDocuments.add(c.document)
    return true
  })

  const { synced, errors } = await upsertCustomersChunked(companyId, deduped)

  return { synced, total: totalFetched, errors }
}
