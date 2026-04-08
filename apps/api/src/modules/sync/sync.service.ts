import { prisma } from '@addere/db'
import { protheusGet, CompanyCredentials } from './protheus.client'
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

  const rawResponse = await protheusGet(companyId, company.apiPord, creds)
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
