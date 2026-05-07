import { prisma } from '@addere/db'
import { protheusPost, CompanyCredentials } from './protheus.client'
import { toStr, toNum } from './field-mapper'
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

const SYNC_CUSTOMERS_PAGE_SIZE = 50
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
  ultcom:       Date | null
  vendorCode:   string | null
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

async function upsertOne(companyId: string, c: CustomerData): Promise<void> {
  await prisma.customer.upsert({
    where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
    update: {
      name:       c.name,
      document:   c.document,
      email:      c.email,
      phone:      c.phone,
      address:    c.address,
      municipio:  c.municipio,
      bairro:     c.bairro,
      cep:        c.cep,
      uf:         c.uf,
      ultcom:     c.ultcom,
      vendorCode: c.vendorCode,
      active:     true,
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
      ultcom:       c.ultcom,
      vendorCode:   c.vendorCode,
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
      await prisma.$transaction(chunk.map((c) => prisma.customer.upsert({
        where: { companyId_loja_protheusCode: { companyId, loja: c.loja, protheusCode: c.protheusCode } },
        update: {
          name:       c.name,
          document:   c.document,
          email:      c.email,
          phone:      c.phone,
          address:    c.address,
          municipio:  c.municipio,
          bairro:     c.bairro,
          cep:        c.cep,
          uf:         c.uf,
          ultcom:     c.ultcom,
          vendorCode: c.vendorCode,
          active:     true,
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
          ultcom:       c.ultcom,
          vendorCode:   c.vendorCode,
        },
      })))
      synced += chunk.length
    } catch {
      // Fallback individual quando clientes multi-loja compartilham o mesmo CNPJ
      // (P2002 em @@unique([companyId, document])).
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

function buildPhone(ddd: string, tel: string): string | null {
  const d = ddd.trim()
  const t = tel.trim()
  if (!t) return null
  return d ? `(${d}) ${t}` : t
}

export async function syncCustomers(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCliente) throw new Error('URL apiCliente não configurada')

  const creds     = getCredentials(company)
  const MAX_PAGES = 500

  const validRecords: CustomerData[] = []
  let totalRecords = 0
  let totalFetched = 0
  let deslocamento = 1

  while (deslocamento <= MAX_PAGES) {
    const body = { limite: SYNC_CUSTOMERS_PAGE_SIZE, deslocamento, INTERV: 0 }
    const rawResponse = await protheusPost(companyId, company.apiCliente, body, creds) as Record<string, unknown>

    const paginas  = (rawResponse['paginas'] ?? {}) as Record<string, unknown>
    const clientes = Array.isArray(rawResponse['clientes']) ? rawResponse['clientes'] as Record<string, unknown>[] : []

    if (deslocamento === 1) {
      totalRecords = toNum(paginas['total'])
    }

    if (clientes.length === 0) break

    for (const raw of clientes) {
      const protheusCode = toStr(raw['A1_COD'])
      if (!protheusCode) continue

      validRecords.push({
        protheusCode,
        loja:       toStr(raw['A1_LOJA'], '01'),
        name:       toStr(raw['A1_NOME'], protheusCode),
        document:   toStr(raw['A1_CGC'])    || null,
        email:      toStr(raw['A1_EMAIL'])  || null,
        phone:      buildPhone(toStr(raw['A1_DDD']), toStr(raw['A1_TEL'])),
        address:    toStr(raw['A1_END'])    || null,
        municipio:  toStr(raw['A1_MUN'])    || null,
        bairro:     toStr(raw['A1_BAIRRO']) || null,
        cep:        toStr(raw['A1_CEP'])    || null,
        uf:         toStr(raw['A1_EST'])    || null,
        ultcom:     parseProtheusDate(raw['A1_ULTCOM']),
        vendorCode: toStr(raw['A1_VEND'])   || null,
      })
    }

    totalFetched += clientes.length

    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (clientes.length < SYNC_CUSTOMERS_PAGE_SIZE) break

    deslocamento += 1
  }

  // Deduplica por document: o Protheus retorna o mesmo CNPJ em múltiplas lojas
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

  return { synced, total: totalRecords || totalFetched, errors }
}

// ─── Sync Transportadoras ─────────────────────────────────────────────────────

const SYNC_TRANSP_PAGE_SIZE = 50

export async function syncTransportadoras(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiTransp) throw new Error('URL apiTransp não configurada')

  const creds     = getCredentials(company)
  const MAX_PAGES = 500

  type TranspData = { protheusCode: string; nome: string }
  const validRecords: TranspData[] = []
  let totalRecords = 0
  let totalFetched = 0
  let deslocamento = 1

  while (deslocamento <= MAX_PAGES) {
    const body = { limite: SYNC_TRANSP_PAGE_SIZE, deslocamento, INTERV: 0 }
    const raw = await protheusPost(companyId, company.apiTransp, body, creds) as Record<string, unknown>

    const paginas       = (raw['paginas'] ?? {}) as Record<string, unknown>
    const transportadoras = Array.isArray(raw['Transportadoras']) ? raw['Transportadoras'] as Record<string, unknown>[] : []

    if (deslocamento === 1) totalRecords = toNum(paginas['total'])
    if (transportadoras.length === 0) break

    for (const t of transportadoras) {
      const protheusCode = toStr(t['A4_COD'])
      if (!protheusCode) continue
      validRecords.push({ protheusCode, nome: toStr(t['A4_NOME'], protheusCode) })
    }

    totalFetched += transportadoras.length
    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (transportadoras.length < SYNC_TRANSP_PAGE_SIZE) break
    deslocamento += 1
  }

  const CHUNK_SIZE = 500
  let synced = 0
  const errors: string[] = []

  for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
    const chunk = validRecords.slice(i, i + CHUNK_SIZE)
    try {
      await prisma.$transaction(chunk.map((t) =>
        prisma.transportadora.upsert({
          where: { companyId_protheusCode: { companyId, protheusCode: t.protheusCode } },
          update: { nome: t.nome },
          create: { companyId, protheusCode: t.protheusCode, nome: t.nome },
        })
      ))
      synced += chunk.length
    } catch (err: unknown) {
      for (const t of chunk) {
        try {
          await prisma.transportadora.upsert({
            where: { companyId_protheusCode: { companyId, protheusCode: t.protheusCode } },
            update: { nome: t.nome },
            create: { companyId, protheusCode: t.protheusCode, nome: t.nome },
          })
          synced++
        } catch (e: unknown) {
          errors.push(`${t.protheusCode}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
        }
      }
    }
  }

  return { synced, total: totalRecords || totalFetched, errors }
}

// ─── Sync Condições de Pagamento ──────────────────────────────────────────────

const SYNC_CONDPAG_PAGE_SIZE = 50

export async function syncCondPags(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCondPag) throw new Error('URL apiCondPag não configurada')

  const creds     = getCredentials(company)
  const MAX_PAGES = 500

  type CondPagData = { protheusCode: string; nome: string }
  const validRecords: CondPagData[] = []
  let totalRecords = 0
  let totalFetched = 0
  let deslocamento = 1

  while (deslocamento <= MAX_PAGES) {
    const body = { limite: SYNC_CONDPAG_PAGE_SIZE, deslocamento, INTERV: 0 }
    const raw = await protheusPost(companyId, company.apiCondPag, body, creds) as Record<string, unknown>

    const paginas = (raw['paginas'] ?? {}) as Record<string, unknown>
    const condpags = Array.isArray(raw['condpag']) ? raw['condpag'] as Record<string, unknown>[] : []

    if (deslocamento === 1) totalRecords = toNum(paginas['total'])
    if (condpags.length === 0) break

    for (const c of condpags) {
      const protheusCode = toStr(c['E4_CODIGO'])
      if (!protheusCode) continue
      validRecords.push({ protheusCode, nome: toStr(c['E4_DESCRI'], protheusCode) })
    }

    totalFetched += condpags.length
    if (totalRecords > 0 && totalFetched >= totalRecords) break
    if (condpags.length < SYNC_CONDPAG_PAGE_SIZE) break
    deslocamento += 1
  }

  const CHUNK_SIZE = 500
  let synced = 0
  const errors: string[] = []

  for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
    const chunk = validRecords.slice(i, i + CHUNK_SIZE)
    try {
      await prisma.$transaction(chunk.map((c) =>
        prisma.condPag.upsert({
          where: { companyId_protheusCode: { companyId, protheusCode: c.protheusCode } },
          update: { nome: c.nome },
          create: { companyId, protheusCode: c.protheusCode, nome: c.nome },
        })
      ))
      synced += chunk.length
    } catch (err: unknown) {
      for (const c of chunk) {
        try {
          await prisma.condPag.upsert({
            where: { companyId_protheusCode: { companyId, protheusCode: c.protheusCode } },
            update: { nome: c.nome },
            create: { companyId, protheusCode: c.protheusCode, nome: c.nome },
          })
          synced++
        } catch (e: unknown) {
          errors.push(`${c.protheusCode}: ${e instanceof Error ? e.message : 'Erro desconhecido'}`)
        }
      }
    }
  }

  return { synced, total: totalRecords || totalFetched, errors }
}

// ─── Sync Pedido → Protheus ───────────────────────────────────────────────────

function formatDateDDMMYYYY(date: Date): string {
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

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
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        branch:         true,
        customer:       true,
        user:           true,
        transportadora: true,
        condPag:        true,
        items: { include: { product: true } },
      },
    }),
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
  ])

  // Reverte o lock em caso de qualquer falha após o claim
  const revertToPending = () => prisma.order.update({ where: { id: orderId }, data: { status: 'PENDING' } })

  try {
    if (!company.apiPedido) throw new Error('URL apiPedido não configurada')

    const creds = getCredentials(company)

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
        C6_DESCONT: String(discount),
      }
    })

    const payload = {
      PEDIDO: [{
        C5_FILIAL:  order.branch.idProtheus,
        C5_CLIENTE: order.customer.protheusCode,
        C5_LOJA:    order.customer.loja ?? '01',
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

    const rawResponse = await protheusPost(companyId, company.apiPedido, payload, creds)

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

    return { protheusOrderId, mensagem: toStr(first['Mensagem']) }
  } catch (err) {
    await revertToPending()
    throw err
  }
}
