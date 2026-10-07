// Histórico de visitas da equipe do gerente (plano 003) — GET /intel/manager/visits.
// Reaproveita loadSellers (o mesmo recorte de Equipe em campo e da carteira
// da equipe, manager.service.ts) e a montagem de app/visits.service.ts; o
// item ganha sellerName por fora — sem ele, ao olhar mais de um vendedor de
// uma vez, o gerente não sabe de quem é a visita.
import type { TeamVisitHistoryDto } from '@addere/types'
import type { ViewerScope } from '../../users/data-scope'
import {
  buildVisitHistoryItems,
  loadVisitRows,
  resolveHistoryWindow,
  summarizeVisitHistory,
  windowRangeDto,
} from '../app/visits.service'
import { loadSellers } from './manager.service'

export interface TeamVisitHistoryQuery {
  vendorCode?: string
  from?: string
  to?: string
}

export type TeamVisitHistoryResult =
  | { ok: true; dto: TeamVisitHistoryDto }
  | { ok: false; reason: 'FORBIDDEN_VENDOR' }
  | { ok: false; reason: 'INVALID_WINDOW' }

export async function buildTeamVisitHistory(
  companyId: string,
  scope: ViewerScope,
  query: TeamVisitHistoryQuery
): Promise<TeamVisitHistoryResult> {
  const window = resolveHistoryWindow(query.from, query.to)
  if (!window) return { ok: false, reason: 'INVALID_WINDOW' }

  const sellers = await loadSellers(companyId, scope)
  const sellerByCode = new Map(sellers.map((seller) => [seller.idVendProt as string, seller]))
  const vendorCodes = [...sellerByCode.keys()]

  // vendorCode é filtro DENTRO do escopo, nunca ampliação dele: código fora
  // da equipe → 403, nunca lista vazia (mesma regra de /customers/signals —
  // lista vazia esconderia o erro de permissão).
  if (query.vendorCode && !sellerByCode.has(query.vendorCode)) {
    return { ok: false, reason: 'FORBIDDEN_VENDOR' }
  }

  const codes = query.vendorCode ? [query.vendorCode] : vendorCodes
  const rows = await loadVisitRows(companyId, codes, window)
  const items = await buildVisitHistoryItems(companyId, rows, window)
  const { total, withOrder, outOfPlan } = summarizeVisitHistory(items)

  const named = items.map(({ vendorCode, ...item }) => ({
    ...item,
    sellerName: sellerByCode.get(vendorCode)?.name ?? vendorCode,
  }))

  return {
    ok: true,
    dto: { range: windowRangeDto(window), total, withOrder, outOfPlan, items: named },
  }
}
