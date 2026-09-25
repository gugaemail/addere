// Estoque ao vivo (E22): consulta o contrato STOCK publicado no Protheus, com
// cache curto em memória; sem contrato (ou com falha) cai no saldo do sync de
// produtos — a resposta sempre diz de onde veio o número.
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { StockDto } from '@addere/types'
import { env } from '../../../lib/env'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { userRateLimit } from '../../../lib/rate-limit'
import { QUERY_CONTRACTS } from '../protheus-sql/contracts'
import { substitutePlaceholders } from '../protheus-sql/placeholders'
import { getSqlAdapter } from '../protheus-sql/sql-api.adapter'

const LIVE_TIMEOUT_MS = 8_000
const CACHE_MS = 10 * 60_000
const paramsSchema = z.object({ productCode: z.string().regex(/^[A-Za-z0-9 ]{1,20}$/) })

interface CacheEntry {
  dto: StockDto
  expiresAt: number
}
const cache = new Map<string, CacheEntry>()

// Visível para testes
export function clearStockCache(): void {
  cache.clear()
}

export default async function stockRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode, userRateLimit(30, '1 minute')]

  // GET /intel/app/stock/:productCode
  app.get('/stock/:productCode', { preHandler: guard }, async (request, reply) => {
    const { productCode } = paramsSchema.parse(request.params)
    const companyId = request.user.companyId as string

    const product = await prisma.product.findFirst({
      where: { companyId, protheusCode: productCode, active: true },
      select: { saldo: true },
    })
    if (!product) return reply.status(404).send({ message: 'Produto não encontrado' })

    const cacheKey = `${companyId}|${productCode}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return reply.send(cached.dto)

    const fromSync: StockDto = {
      productCode,
      saldo: Number(product.saldo).toFixed(2),
      local: null,
      source: 'sync',
      checkedAt: new Date().toISOString(),
    }

    const live = await liveStock(companyId, productCode)
    const dto = live ?? fromSync
    cache.set(cacheKey, { dto, expiresAt: Date.now() + CACHE_MS })
    return reply.send(dto)
  })
}

async function liveStock(companyId: string, productCode: string): Promise<StockDto | null> {
  const [company, query, branches] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.intelQuery.findFirst({
      where: { companyId, name: 'STOCK', published: true },
      orderBy: { version: 'desc' },
      select: { sql: true },
    }),
    prisma.branch.findMany({
      where: { companyId, active: true, idProtheus: { not: null } },
      select: { idProtheus: true },
    }),
  ])
  if (!company || !query || !company.apiSql) return null

  const substituted = substitutePlaceholders(query.sql, {
    produto: productCode,
    branches: branches.map((b) => b.idProtheus as string),
  })
  if (substituted.errors.length > 0) return null

  try {
    const result = await getSqlAdapter(env.INTEL_SQL_ADAPTER).run(company, substituted.sql, {
      queryName: QUERY_CONTRACTS.STOCK.name,
      timeoutMs: LIVE_TIMEOUT_MS,
      maxRows: 50,
    })
    // Várias filiais/locais: soma os saldos; `local` só quando é um só
    let saldo = 0
    const locais = new Set<string>()
    for (const row of result.rows) {
      const lower = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))
      saldo += Number(lower.get('saldo') ?? 0) || 0
      const local = lower.get('local')
      if (local !== null && local !== undefined && String(local).trim()) locais.add(String(local).trim())
    }
    if (result.rows.length === 0) return null
    return {
      productCode,
      saldo: saldo.toFixed(2),
      local: locais.size === 1 ? [...locais][0] : null,
      source: 'live',
      checkedAt: new Date().toISOString(),
    }
  } catch {
    // Endpoint fora ou lento: o app mostra o saldo do sync, marcado como tal
    return null
  }
}
