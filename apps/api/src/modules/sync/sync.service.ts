import { prisma } from '@addere/db'
import { protheusGet, CompanyCredentials } from './protheus.client'
import { mapRecord, extractRecords } from './field-mapper'
import { DEFAULT_MAPPINGS } from './default-mappings'

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
    passProtheus: company.passProtheus,
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

  let synced = 0
  const errors: string[] = []

  for (const raw of records) {
    const mapped = mapRecord(raw, mapping.fields)

    if (!mapped['protheusCode']) continue

    try {
      await prisma.product.upsert({
        where: {
          companyId_protheusCode: {
            companyId,
            protheusCode: mapped['protheusCode'] as string,
          },
        },
        update: {
          name:   String(mapped['name']  ?? ''),
          price:  Number(mapped['price'] ?? 0),
          unit:   String(mapped['unit']  ?? 'UN'),
          stock:  Number(mapped['stock'] ?? 0),
          saldo:  Number(mapped['saldo'] ?? 0),
          active: true,
        },
        create: {
          companyId,
          protheusCode: mapped['protheusCode'] as string,
          name:         String(mapped['name']  ?? ''),
          price:        Number(mapped['price'] ?? 0),
          unit:         String(mapped['unit']  ?? 'UN'),
          stock:        Number(mapped['stock'] ?? 0),
          saldo:        Number(mapped['saldo'] ?? 0),
        },
      })
      synced++
    } catch (err) {
      errors.push(`protheusCode=${mapped['protheusCode']}: ${(err as Error).message}`)
    }
  }

  return { synced, total: records.length, errors }
}
