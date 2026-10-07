// Montagem do histórico de visitas (plano 003) — compartilhada entre o GET
// do vendedor (/intel/app/visits, abaixo) e o do gerente (/intel/manager/visits,
// que reaproveita buildVisitHistoryItems e acrescenta sellerName por fora, em
// manager/visits.service.ts).
import { prisma } from '@addere/db'
import type { Visit } from '@prisma/client'
import type { VisitHistoryItemDto } from '@addere/types'
import { addDaysYmd, diffDays, ymdSaoPaulo, ymdToDate } from '../engine/business-days'

export const DEFAULT_WINDOW_DAYS = 30
export const MAX_WINDOW_DAYS = 90

export interface HistoryWindow {
  fromYmd: string // 'YYYYMMDD'
  toYmd: string // 'YYYYMMDD'
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' — formato que o DTO (`ymd`, `range`) e a tela usam. */
function dashYmd(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

/**
 * Janela [fromYmd, toYmd] a partir da query (`from`/`to` em 'YYYY-MM-DD',
 * opcionais). Padrão: últimos 30 dias terminando hoje (dia civil de São
 * Paulo). `null` quando a janela pedida passa de MAX_WINDOW_DAYS ou vem
 * invertida — quem chama responde 400 nesse caso (mensagem é da rota).
 */
export function resolveHistoryWindow(from?: string, to?: string): HistoryWindow | null {
  const toYmd = to ? to.replace(/-/g, '') : ymdSaoPaulo(new Date())
  const fromYmd = from ? from.replace(/-/g, '') : addDaysYmd(toYmd, -(DEFAULT_WINDOW_DAYS - 1))
  const span = diffDays(fromYmd, toYmd) // toYmd − fromYmd, em dias
  if (span < 0 || span >= MAX_WINDOW_DAYS) return null
  return { fromYmd, toYmd }
}

export function windowRangeDto(window: HistoryWindow): { from: string; to: string } {
  return { from: dashYmd(window.fromYmd), to: dashYmd(window.toYmd) }
}

/**
 * Carrega as linhas de Visit no recorte — rede larga em UTC (±1/2 dias) e
 * recorte fino pelo dia civil de São Paulo em buildVisitHistoryItems, a
 * mesma técnica de loadVisits em manager/manager.service.ts para a mesma
 * necessidade (evita matemática de fuso direto no `where` do Prisma).
 */
export async function loadVisitRows(
  companyId: string,
  vendorCodes: string[],
  window: HistoryWindow
): Promise<Visit[]> {
  if (vendorCodes.length === 0) return []
  return prisma.visit.findMany({
    where: {
      companyId,
      vendorCode: vendorCodes.length === 1 ? vendorCodes[0] : { in: vendorCodes },
      arrivedAt: {
        gte: ymdToDate(addDaysYmd(window.fromYmd, -1)),
        lte: ymdToDate(addDaysYmd(window.toYmd, 2)),
      },
    },
    orderBy: { arrivedAt: 'desc' },
    take: 200,
  })
}

// Linha do DTO com o vendorCode ainda anexado — só manager/visits.service.ts
// lê esse campo (para resolver sellerName); a rota do vendedor descarta antes
// de responder, porque VisitHistoryItemDto não o inclui.
export interface VisitHistoryRow extends VisitHistoryItemDto {
  vendorCode: string
}

/**
 * Monta os itens do DTO a partir das linhas carregadas: recorte fino pelo dia
 * civil (a rede larga de loadVisitRows pode trazer visitas de fora da
 * janela) e nome do cliente. O nome vem de uma consulta separada por
 * {protheusCode, loja} — mesma técnica de buildPlanDto em plan.service.ts:
 * Map por `${protheusCode}|${loja ?? '01'}`, com fallback para o próprio
 * código quando o cliente não for encontrado (ex.: cadastro removido depois
 * da visita).
 */
export async function buildVisitHistoryItems(
  companyId: string,
  rows: Visit[],
  window: HistoryWindow
): Promise<VisitHistoryRow[]> {
  const inWindow = rows.filter((visit) => {
    const ymd = ymdSaoPaulo(visit.arrivedAt)
    return ymd >= window.fromYmd && ymd <= window.toYmd
  })
  if (inWindow.length === 0) return []

  const customers = await prisma.customer.findMany({
    where: { companyId, protheusCode: { in: inWindow.map((v) => v.customerCode) } },
    select: { protheusCode: true, loja: true, name: true },
  })
  const byKey = new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))

  return inWindow.map((visit) => {
    const customer = byKey.get(`${visit.customerCode}|${visit.loja ?? '01'}`)
    return {
      id: visit.id,
      ymd: dashYmd(ymdSaoPaulo(visit.arrivedAt)),
      arrivedAt: visit.arrivedAt.toISOString(),
      durationMin: visit.leftAt
        ? Math.round((visit.leftAt.getTime() - visit.arrivedAt.getTime()) / 60_000)
        : null,
      source: visit.source,
      customerCode: visit.customerCode,
      loja: visit.loja,
      customerName: customer?.name ?? visit.customerCode,
      planned: visit.planItemId !== null,
      result: visit.result,
      noOrderReason: visit.noOrderReason,
      orderId: visit.orderId,
      vendorCode: visit.vendorCode,
    }
  })
}

/** Contadores do cabeçalho da tela — "32 visitas · 19 viraram pedido …". */
export function summarizeVisitHistory(items: VisitHistoryItemDto[]): {
  total: number
  withOrder: number
  outOfPlan: number
} {
  return {
    total: items.length,
    withOrder: items.filter((item) => item.result === 'ORDER').length,
    outOfPlan: items.filter((item) => !item.planned).length,
  }
}
