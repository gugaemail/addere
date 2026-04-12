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

export async function syncProducts(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiPord) throw new Error('URL apiPord não configurada')

  const creds = getCredentials(company)
  const config = creds.syncConfig as Record<string, unknown> | null
  const mapping = (config?.products as typeof DEFAULT_MAPPINGS.products | undefined) ?? DEFAULT_MAPPINGS.products

  const method = (config?.products as Record<string, unknown> | undefined)?.method as string | undefined
  const body   = (config?.products as Record<string, unknown> | undefined)?.body ?? {}
  const rawResponse = method === 'POST'
    ? await protheusPost(companyId, company.apiPord, body, creds)
    : await protheusGet(companyId, company.apiPord, creds)
  const records = extractRecords(rawResponse, mapping.responseKey)

  const errors: string[] = []

  // Mapeia todos os registros e filtra os sem protheusCode antes de ir ao banco
  type ProductData = {
    protheusCode: string
    name: string
    price: number
    unit: string
    stock: number
    saldo: number
  }

  const validRecords: ProductData[] = []

  for (const raw of records) {
    const mapped = mapRecord(raw, mapping.fields)
    const protheusCode = toStr(mapped['protheusCode'])
    if (!protheusCode) continue

    const price = toNum(mapped['price'])
    const stock = toNum(mapped['stock'])
    const saldo = toNum(mapped['saldo'])

    if (!Number.isFinite(price) || !Number.isFinite(stock) || !Number.isFinite(saldo)) {
      errors.push(`protheusCode=${protheusCode}: valor numérico inválido no registro`)
      continue
    }

    validRecords.push({
      protheusCode,
      name:  toStr(mapped['name'], protheusCode),
      price,
      unit:  toStr(mapped['unit'], 'UN'),
      stock,
      saldo,
    })
  }

  // Executa todos os upserts em uma única transação para reduzir round-trips
  let synced = 0

  await prisma.$transaction(
    validRecords.map((p) =>
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
  ).then((results) => {
    synced = results.length
  }).catch((err: Error) => {
    errors.push(`Erro na transação em lote: ${err.message}`)
  })

  return { synced, total: records.length, errors }
}

// ─── Sync Clientes ────────────────────────────────────────────────────────────

export async function syncCustomers(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  if (!company.apiCliente) throw new Error('URL apiCliente não configurada')

  const creds = getCredentials(company)
  const config = creds.syncConfig as Record<string, unknown> | null
  const mapping = (config?.customers as typeof DEFAULT_MAPPINGS.customers | undefined) ?? DEFAULT_MAPPINGS.customers

  const custMethod = (config?.customers as Record<string, unknown> | undefined)?.method as string | undefined
  const custBody   = (config?.customers as Record<string, unknown> | undefined)?.body ?? {}
  const rawResponse = custMethod === 'POST'
    ? await protheusPost(companyId, company.apiCliente, custBody, creds)
    : await protheusGet(companyId, company.apiCliente, creds)
  const records = extractRecords(rawResponse, mapping.responseKey)

  const errors: string[] = []

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

  const validRecords: CustomerData[] = []

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

  let synced = 0

  await prisma.$transaction(
    validRecords.map((c) =>
      prisma.customer.upsert({
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
    )
  ).then((results) => {
    synced = results.length
  }).catch((err: Error) => {
    errors.push(`Erro na transação em lote: ${err.message}`)
  })

  return { synced, total: records.length, errors }
}
