import { prisma } from '@addere/db'
import { protheusPost, CompanyCredentials } from './protheus.client'
import { toStr, toNum } from './field-mapper'
import { decryptCredential } from '../../lib/protheus-crypto'
import type { SyncSchedule, MetaVendedor } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { logProtheusCall } from './protheus-logger'
import { logger } from '../../lib/logger'


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

/** Tenta parsear um campo que pode ser string JSON ou já um objeto */
function parseJsonField(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown> } catch { return {} }
  }
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  return {}
}

/** Parseia data no formato YYYYMMDD retornado pelo Protheus */
function parseProtheusDate(value: unknown): Date | null {
  const s = toStr(value as string)
  if (!s || s.length !== 8) return null
  const year  = parseInt(s.slice(0, 4), 10)
  const month = parseInt(s.slice(4, 6), 10) - 1
  const day   = parseInt(s.slice(6, 8), 10)
  const d = new Date(year, month, day)
  return isNaN(d.getTime()) ? null : d
}

interface PaginateOptions {
  companyId: string
  url: string
  creds: CompanyCredentials
  pageSize: number
  extraBody?: Record<string, unknown>
}

/**
 * Executa paginação genérica contra o Protheus.
 * `extract` recebe a resposta bruta e devolve { total, records }.
 */
async function paginateProtheus<T>(
  opts: PaginateOptions,
  extract: (raw: Record<string, unknown>, page: number) => { total: number; records: T[] },
): Promise<T[]> {
  const { companyId, url, creds, pageSize, extraBody = {} } = opts
  const MAX_PAGES = 500
  const all: T[] = []
  let deslocamento = 1
  let totalRecords = 0
  let totalFetched = 0

  while (deslocamento <= MAX_PAGES) {
    const body = { limite: pageSize, deslocamento, ...extraBody }
    const raw = await protheusPost(companyId, url, body, creds) as Record<string, unknown>
    const { total, records } = extract(raw, deslocamento)

    if (deslocamento === 1) totalRecords = total
    if (records.length === 0) break

    all.push(...records)
    totalFetched += records.length

    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (records.length < pageSize) break

    deslocamento += 1
  }

  return all
}

interface LogOpts {
  companyId:    string
  operation:    string
  endpointKey:  string
  recordsSynced?: number
  totalRecords?:  number
  metadata?:      Record<string, unknown>
}

/**
 * Executa `fn` e registra o resultado (sucesso ou erro) no log Protheus.
 * Relança o erro original após logar.
 */
async function withProtheusLog<T>(fn: () => Promise<T>, opts: LogOpts): Promise<T> {
  const t0 = Date.now()
  try {
    const result = await fn()
    await logProtheusCall({
      companyId:     opts.companyId,
      operation:     opts.operation,
      endpointKey:   opts.endpointKey,
      success:       true,
      durationMs:    Date.now() - t0,
      recordsSynced: opts.recordsSynced,
      totalRecords:  opts.totalRecords,
      metadata:      opts.metadata,
    })
    return result
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId:    opts.companyId,
      operation:    opts.operation,
      endpointKey:  opts.endpointKey,
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
      metadata:     opts.metadata,
    })
    throw err
  }
}

/** Executa upserts em chunks para evitar transações com milhares de operações */
async function upsertChunked<T>(
  items: T[],
  upsertOne: (item: T) => Promise<void>,
  chunkSize = 500,
): Promise<{ synced: number; errors: string[] }> {
  let synced = 0
  const errors: string[] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    try {
      await Promise.all(chunk.map(upsertOne))
      synced += chunk.length
    } catch {
      for (const item of chunk) {
        try {
          await upsertOne(item)
          synced++
        } catch (err: unknown) {
          errors.push(err instanceof Error ? err.message : 'Erro desconhecido')
        }
      }
    }
  }

  return { synced, errors }
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

export async function syncProducts(companyId: string, operationLabel = 'syncProducts') {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { branches: { where: { active: true }, take: 1 } },
  })

  if (!company.apiPord) throw new Error('URL apiPord não configurada')

  const branch = company.branches[0]
  if (!branch) throw new Error('Nenhuma filial ativa encontrada para a empresa')
  if (!branch.idProtheus) throw new Error('Filial sem código Protheus configurado')

  const filial   = branch.idProtheus
  const creds    = getCredentials(company)
  const schedule = (company.syncSchedule as SyncSchedule | null) ?? DEFAULT_SYNC_SCHEDULE
  const INTERV   = schedule.products.interv ?? 0

  return withProtheusLog(async () => {
    const records = await paginateProtheus<ProductData>(
      { companyId, url: company.apiPord!, creds, pageSize: SYNC_PRODUCTS_PAGE_SIZE, extraBody: { B2_FILIAL: filial, DA1_FILIAL: filial, INTERV } },
      (raw) => {
        const paginas  = (raw['paginas']  ?? {}) as Record<string, unknown>
        const produtos = Array.isArray(raw['produtos']) ? raw['produtos'] as Record<string, unknown>[] : []
        const items: ProductData[] = []
        for (const p of produtos) {
          const protheusCode = toStr(p['id'])
          if (!protheusCode) continue
          const precoObj   = parseJsonField(p['preco'])
          const estoqueObj = parseJsonField(p['estoque'])
          const price = toNum(precoObj['atual'])
          const stock = toNum(estoqueObj['quantidade'])
          items.push({
            protheusCode,
            name:  toStr(p['nome'], protheusCode),
            price: Number.isFinite(price) ? price : 0,
            unit:  'UN',
            stock: Number.isFinite(stock) ? stock : 0,
            saldo: Number.isFinite(stock) ? stock : 0,
          })
        }
        return { total: toNum(paginas['total']), records: items }
      },
    )

    const CHUNK_SIZE = 500
    let synced = 0
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE)
      const results = await prisma.$transaction(
        chunk.map((p) =>
          prisma.product.upsert({
            where: { companyId_protheusCode: { companyId, protheusCode: p.protheusCode } },
            update: { name: p.name, price: p.price, unit: p.unit, stock: p.stock, saldo: p.saldo, active: true },
            create: { companyId, protheusCode: p.protheusCode, name: p.name, price: p.price, unit: p.unit, stock: p.stock, saldo: p.saldo },
          })
        )
      )
      synced += results.length
    }

    return { synced, total: records.length, errors: [] as string[] }
  }, { companyId, operation: operationLabel, endpointKey: 'apiPord' })
}

// ─── Sync Clientes ────────────────────────────────────────────────────────────

const SYNC_CUSTOMERS_PAGE_SIZE = 50

type CustomerData = {
  protheusCode:  string
  loja:          string
  name:          string
  document:      string | null
  email:         string | null
  phone:         string | null
  address:       string | null
  municipio:     string | null
  bairro:        string | null
  cep:           string | null
  uf:            string | null
  ultcom:        Date | null
  vendorCode:    string | null
  msblql:        string | null
  transpPadrao:  string | null
  condPagPadrao: string | null
  tes:           string | null
  xcodemp:       string | null
}

function buildPhone(ddd: string, tel: string): string | null {
  const d = ddd.trim()
  const t = tel.trim()
  if (!t) return null
  return d ? `(${d}) ${t}` : t
}

async function upsertCustomer(companyId: string, c: CustomerData): Promise<void> {
  const active = c.msblql !== '1'
  const fields = {
    name:          c.name,
    document:      c.document,
    email:         c.email,
    phone:         c.phone,
    address:       c.address,
    municipio:     c.municipio,
    bairro:        c.bairro,
    cep:           c.cep,
    uf:            c.uf,
    ultcom:        c.ultcom,
    vendorCode:    c.vendorCode,
    msblql:        c.msblql,
    transpPadrao:  c.transpPadrao,
    condPagPadrao: c.condPagPadrao,
    tes:           c.tes,
    xcodemp:       c.xcodemp,
    active,
  }
  await prisma.customer.upsert({
    where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
    update: fields,
    create: { companyId, protheusCode: c.protheusCode, loja: c.loja, ...fields },
  })
}

export async function syncCustomers(companyId: string, operationLabel = 'syncCustomers') {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCliente) throw new Error('URL apiCliente não configurada')

  const creds     = getCredentials(company)
  const scheduleC = (company.syncSchedule as SyncSchedule | null) ?? DEFAULT_SYNC_SCHEDULE
  const INTERV    = scheduleC.customers.interv ?? 0

  return withProtheusLog(async () => {
    const records = await paginateProtheus<CustomerData>(
      { companyId, url: company.apiCliente!, creds, pageSize: SYNC_CUSTOMERS_PAGE_SIZE, extraBody: { INTERV } },
      (raw) => {
        const paginas  = (raw['paginas'] ?? {}) as Record<string, unknown>
        const clientes = Array.isArray(raw['clientes']) ? raw['clientes'] as Record<string, unknown>[] : []
        const items: CustomerData[] = []
        for (const c of clientes) {
          const protheusCode = toStr(c['A1_COD'])
          if (!protheusCode) continue
          items.push({
            protheusCode,
            loja:          toStr(c['A1_LOJA'], '01'),
            name:          toStr(c['A1_NOME'], protheusCode),
            document:      toStr(c['A1_CGC'])    || null,
            email:         toStr(c['A1_EMAIL'])  || null,
            phone:         buildPhone(toStr(c['A1_DDD']), toStr(c['A1_TEL'])),
            address:       toStr(c['A1_END'])    || null,
            municipio:     toStr(c['A1_MUN'])    || null,
            bairro:        toStr(c['A1_BAIRRO']) || null,
            cep:           toStr(c['A1_CEP'])    || null,
            uf:            toStr(c['A1_EST'])    || null,
            ultcom:        parseProtheusDate(c['A1_ULTCOM']),
            vendorCode:    toStr(c['A1_VEND'])      || null,
            msblql:        toStr(c['A1_MSBLQL'])    || null,
            transpPadrao:  toStr(c['A1_TRANSP'])    || null,
            condPagPadrao: toStr(c['A1_COND'])      || null,
            tes:           toStr(c['A1_TES'])        || null,
            xcodemp:       toStr(c['A1_XCODEMP'])   || null,
          })
        }
        return { total: toNum(paginas['total']), records: items }
      },
    )

    // Deduplica por document: o Protheus retorna o mesmo CNPJ em múltiplas lojas
    // (A1_LOJA='01', '02'...). A constraint @@unique([companyId, document]) aceita apenas um
    // registro por CNPJ — mantemos a primeira ocorrência (geralmente loja='01').
    const seenDocuments = new Set<string>()
    const deduped = records.filter((c) => {
      if (!c.document) return true
      if (seenDocuments.has(c.document)) return false
      seenDocuments.add(c.document)
      return true
    })

    const { synced, errors } = await upsertChunked(
      deduped,
      (c) => upsertCustomer(companyId, c),
    )

    return { synced, total: records.length, errors }
  }, { companyId, operation: operationLabel, endpointKey: 'apiCliente' })
}

// ─── Sync Transportadoras ─────────────────────────────────────────────────────

const SYNC_TRANSP_PAGE_SIZE = 50

export async function syncTransportadoras(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiTransp) throw new Error('URL apiTransp não configurada')

  const creds = getCredentials(company)

  return withProtheusLog(async () => {
    type TranspData = { protheusCode: string; nome: string }

    const records = await paginateProtheus<TranspData>(
      { companyId, url: company.apiTransp!, creds, pageSize: SYNC_TRANSP_PAGE_SIZE, extraBody: { INTERV: 0 } },
      (raw) => {
        const paginas         = (raw['paginas'] ?? {}) as Record<string, unknown>
        const transportadoras = Array.isArray(raw['Transportadoras']) ? raw['Transportadoras'] as Record<string, unknown>[] : []
        const items: TranspData[] = []
        for (const t of transportadoras) {
          const protheusCode = toStr(t['A4_COD'])
          if (!protheusCode) continue
          items.push({ protheusCode, nome: toStr(t['A4_NOME'], protheusCode) })
        }
        return { total: toNum(paginas['total']), records: items }
      },
    )

    const { synced, errors } = await upsertChunked(records, async (t) => {
      await prisma.transportadora.upsert({
        where: { companyId_protheusCode: { companyId, protheusCode: t.protheusCode } },
        update: { nome: t.nome },
        create: { companyId, protheusCode: t.protheusCode, nome: t.nome },
      })
    })

    return { synced, total: records.length, errors }
  }, { companyId, operation: 'syncTransportadoras', endpointKey: 'apiTransp' })
}

// ─── Sync Condições de Pagamento ──────────────────────────────────────────────

const SYNC_CONDPAG_PAGE_SIZE = 50

export async function syncCondPags(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCondPag) throw new Error('URL apiCondPag não configurada')

  const creds = getCredentials(company)

  return withProtheusLog(async () => {
    type CondPagData = { protheusCode: string; nome: string }

    const records = await paginateProtheus<CondPagData>(
      { companyId, url: company.apiCondPag!, creds, pageSize: SYNC_CONDPAG_PAGE_SIZE, extraBody: { INTERV: 0 } },
      (raw) => {
        const paginas  = (raw['paginas'] ?? {}) as Record<string, unknown>
        const condpags = Array.isArray(raw['condpag']) ? raw['condpag'] as Record<string, unknown>[] : []
        const items: CondPagData[] = []
        for (const c of condpags) {
          const protheusCode = toStr(c['E4_CODIGO'])
          if (!protheusCode) continue
          items.push({ protheusCode, nome: toStr(c['E4_DESCRI'], protheusCode) })
        }
        return { total: toNum(paginas['total']), records: items }
      },
    )

    const { synced, errors } = await upsertChunked(records, async (c) => {
      await prisma.condPag.upsert({
        where: { companyId_protheusCode: { companyId, protheusCode: c.protheusCode } },
        update: { nome: c.nome },
        create: { companyId, protheusCode: c.protheusCode, nome: c.nome },
      })
    })

    return { synced, total: records.length, errors }
  }, { companyId, operation: 'syncCondPags', endpointKey: 'apiCondPag' })
}

// ─── Sync Pedido → Protheus ───────────────────────────────────────────────────

function formatDateDDMMYYYY(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

type OrderForSync = {
  branch:         { idProtheus: string | null }
  customer:       { protheusCode: string | null; loja: string | null; tes: string | null }
  user:           { idVendProt: string | null }
  transportadora: { protheusCode: string | null } | null
  condPag:        { protheusCode: string | null } | null
  id:             string
  emissao:        Date | null
  mennota:        string | null
  notes:          string | null
  items: Array<{
    product:      { protheusCode: string | null; name: string }
    largura:      unknown
    espessura:    unknown
    encolhimento: string | null
    xcrav:        string | null
    tara:         unknown
    discount:     unknown
    quantity:     unknown
    unitPrice:    unknown
  }>
}

function buildOrderPayload(order: OrderForSync) {
  if (!order.branch.idProtheus)     throw new Error('Filial sem código Protheus configurado')
  if (!order.customer.protheusCode) throw new Error('Cliente sem código Protheus configurado')
  if (!order.user.idVendProt)       throw new Error('Vendedor sem código Protheus configurado (idVendProt)')

  const emissaoStr = formatDateDDMMYYYY(order.emissao ?? new Date())

  const itens = order.items.map((item) => {
    if (!item.product.protheusCode) throw new Error(`Produto "${item.product.name}" sem código Protheus configurado`)

    const discount  = Number(item.discount)
    const qty       = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const valdesc   = Number((unitPrice * qty * discount / 100).toFixed(2))

    return {
      C6_FILIAL:  order.branch.idProtheus,
      C6_PRODUTO: item.product.protheusCode,
      C6_QTDVEN:  String(qty),
      C6_PRCVEN:  String(unitPrice),
      C6_PRUNIT:  String(unitPrice),
      C6_VALDESC: String(valdesc),
      ...(order.customer.tes ? { C6_TES: order.customer.tes } : {}),
      C6_XLARGUR: item.largura   != null ? String(Number(item.largura))   : '0',
      C6_XEXPESS: item.espessura != null ? String(Number(item.espessura)) : '0',
      C6_XENCOLH: item.encolhimento ?? '',
      C6_XCRAV:   item.xcrav        ?? '',
      C6_XTARA:   item.tara   != null ? String(Number(item.tara))         : '0',
    }
  })

  const loja = order.customer.loja ?? '01'
  return {
    PEDIDO: [{
      C5_FILIAL:  order.branch.idProtheus,
      C5_CLIENTE: order.customer.protheusCode,
      C5_CLIENT:  order.customer.protheusCode,
      C5_LOJA:    loja,
      C5_LOJACLI: loja,
      C5_XIDPED:  order.id,
      C5_EMISSAO: emissaoStr,
      C5_VEND1:   order.user.idVendProt,
      C5_DESCONT: '0',
      C5_TRANSP:  order.transportadora?.protheusCode ?? '',
      C5_MENNOTA: order.mennota ?? '',
      C5_XOBS:    order.notes ?? '',
      C5_CONDPAG: order.condPag?.protheusCode ?? '',
      ITENS: itens,
    }],
  }
}

const orderDetailInclude = {
  branch:         true,
  customer:       true,
  user:           true,
  transportadora: true,
  condPag:        true,
  items: { include: { product: true } },
} as const

export async function syncOrderToProtheus(orderId: string, companyId: string) {
  // Atomic claim: garante que apenas uma requisição concorrente processa o pedido.
  // updateMany retorna count=0 se o pedido não estiver em PENDING, evitando race condition.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, companyId, status: 'PENDING' },
    data:  { status: 'SYNCED' },
  })

  if (claimed.count === 0) {
    const exists = await prisma.order.findFirst({ where: { id: orderId, companyId } })
    throw new Error(exists
      ? 'Apenas pedidos com status PENDING podem ser sincronizados'
      : 'Pedido não encontrado'
    )
  }

  // Carrega detalhes do pedido e da empresa em paralelo agora que somos donos do lock
  const [order, company] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetailInclude }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  // Reverte o lock em caso de qualquer falha após o claim
  const revertToPending = () => prisma.order.update({ where: { id: orderId }, data: { status: 'PENDING' } })

  try {
    if (!company.apiPedido) throw new Error('URL apiPedido não configurada')

    const creds   = getCredentials(company)
    const payload = buildOrderPayload(order)

    logger.info({ orderId, payload }, 'sync-order-payload')
    const t0 = Date.now()
    const rawResponse = await protheusPost(companyId, company.apiPedido, payload, creds)
    const ms = Date.now() - t0
    logger.info({ orderId, ms, rawResponse }, 'sync-order-response')

    // Protheus retorna array: [{ "Retorno": "100", "Mensagem": "...", "Pedido": "012283" }]
    const responseArray = Array.isArray(rawResponse) ? rawResponse as Record<string, unknown>[] : [rawResponse as Record<string, unknown>]
    const first = responseArray[0] ?? {}
    const retorno = toStr(first['Retorno'])

    if (retorno !== '100') {
      const mensagem = toStr(first['Mensagem']) || 'Erro ao gravar pedido no Protheus'
      throw new Error(mensagem)
    }

    const protheusOrderId = toStr(first['Pedido']) || null
    if (!protheusOrderId) throw new Error('Pedido gravado no Protheus mas número do pedido não foi retornado')

    await prisma.order.update({
      where: { id: orderId },
      data: { protheusOrderId, syncedAt: new Date() },
    })

    await logProtheusCall({
      companyId,
      operation:     'syncOrder',
      endpointKey:   'apiPedido',
      success:       true,
      durationMs:    ms,
      recordsSynced: 1,
      metadata:      { orderId, protheusOrderId },
    })

    return { protheusOrderId, mensagem: toStr(first['Mensagem']) }
  } catch (err) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string }
    logger.error({ orderId, message: e.message, protheusResponse: e.response?.data }, 'sync-order-error')
    await logProtheusCall({
      companyId,
      operation:    'syncOrder',
      endpointKey:  'apiPedido',
      success:      false,
      httpStatus:   e.response?.status,
      errorMessage: e.message,
      metadata:     { orderId },
    })
    await revertToPending()
    throw err
  }
}

export async function consultOrderStatus(orderId: string, companyId: string) {
  const [order, company] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, companyId }, include: { branch: true } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!order) throw new Error('Pedido não encontrado')
  if (!order.protheusOrderId) throw new Error('Pedido ainda não foi sincronizado com o Protheus (sem número de pedido)')
  if (!company.apiConsPed) throw new Error('URL apiConsPed não configurada')
  if (!order.branch.idProtheus) throw new Error('Filial sem código Protheus configurado')

  const creds   = getCredentials(company)
  const payload = { C5_FILIAL: order.branch.idProtheus, C5_NUM: order.protheusOrderId }

  return withProtheusLog(async () => {
    const rawResponse = await protheusPost(companyId, company.apiConsPed!, payload, creds) as Record<string, unknown>

    const codigo = toStr(rawResponse['codigo'])
    const status = toStr(rawResponse['status'])

    if (status) {
      await prisma.order.update({ where: { id: orderId }, data: { protheusStatus: status } })
    }

    return { protheusOrderId: order.protheusOrderId, codigo, status }
  }, { companyId, operation: 'consultOrder', endpointKey: 'apiConsPed', metadata: { orderId, protheusOrderId: order.protheusOrderId } })
}

// Dry run: monta o payload e chama o Protheus sem alterar o status do pedido no banco.
// Útil para depuração — pode ser chamado em pedidos PENDING ou SYNCED.
export async function testOrderSync(orderId: string, companyId: string) {
  const [order, company] = await Promise.all([
    prisma.order.findFirst({ where: { id: orderId, companyId }, include: orderDetailInclude }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!order) throw new Error('Pedido não encontrado')
  if (!company.apiPedido) throw new Error('URL apiPedido não configurada')

  const creds   = getCredentials(company)
  const payload = buildOrderPayload(order)

  return withProtheusLog(async () => {
    const t0          = Date.now()
    const rawResponse = await protheusPost(companyId, company.apiPedido!, payload, creds)
    const ms          = Date.now() - t0
    return { ok: true, orderStatus: order.status, ms, payload, rawResponse }
  }, { companyId, operation: 'testOrder', endpointKey: 'apiPedido', metadata: { orderId } })
}

/** Erro de pré-condição do cliente/empresa (ex.: usuário sem idVendProt) — nunca é falha de upstream Protheus. */
export class MetaPreconditionError extends Error {}

export async function fetchMetaVendedor(userId: string, companyId: string): Promise<MetaVendedor> {
  const [user, company] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  if (!user.idVendProt) throw new MetaPreconditionError('Usuário sem código de vendedor Protheus (idVendProt)')
  if (!company.apiMetaVend) throw new MetaPreconditionError('URL apiMetaVend não configurada')

  const creds  = getCredentials(company)
  const now    = new Date()
  const anomes = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

  return withProtheusLog(async () => {
    const rawResponse = await protheusPost(
      companyId,
      company.apiMetaVend!,
      { CODVEND: user.idVendProt, ANOMES: anomes },
      creds,
    ) as Record<string, unknown>

    const periodo = toStr(rawResponse['periodo'])
    const vendido = toStr(rawResponse['vendido'])
    const meta    = toStr(rawResponse['meta'])

    // Protheus responde 200 com campos vazios quando não há meta cadastrada
    // para este vendedor no período consultado.
    const hasMeta = meta !== ''

    return { periodo, vendido, meta, hasMeta }
  }, { companyId, operation: 'fetchMeta', endpointKey: 'apiMetaVend' })
}
