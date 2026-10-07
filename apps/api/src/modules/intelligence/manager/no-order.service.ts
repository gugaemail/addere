// "Por que não vendeu" (E22, plano 002): carrega as visitas NO_ORDER com
// motivo preenchido no período e delega a agregação a no-order.ts (puro).
import { prisma } from '@addere/db'
import type { NoOrderReportDto } from '@addere/types'
import { ymdSaoPaulo } from '../engine/business-days'
import { sellerWhere, type ViewerScope } from '../../users/data-scope'
import { buildNoOrderReport, type NoOrderFact } from './no-order'
import { addDays, rangeWindow, ymdToUtcDate, type DateWindow, type TeamRange } from './range'

function customerKey(row: { customerCode: string; loja: string }): string {
  return `${row.customerCode}|${row.loja}`
}

function emptyDto(window: DateWindow): NoOrderReportDto {
  return { range: window, ...buildNoOrderReport([]) }
}

export async function buildNoOrderReasonsReport(
  companyId: string,
  scope: ViewerScope,
  anchorYmd: string,
  range: TeamRange
): Promise<NoOrderReportDto> {
  const window = rangeWindow(anchorYmd, range)

  const sellers = await prisma.user.findMany({
    where: {
      companyId,
      active: true,
      idVendProt: { not: null },
      ...sellerWhere(scope),
    },
    select: { name: true, idVendProt: true },
  })
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  if (vendorCodes.length === 0) return emptyDto(window)
  const nameByVendor = new Map(sellers.map((s) => [s.idVendProt as string, s.name]))

  // Rede larga em UTC (±1 dia) e recorte fino pelo dia civil de São Paulo —
  // mesma técnica de loadVisits em manager.service.ts.
  const visits = await prisma.visit.findMany({
    where: {
      companyId,
      vendorCode: { in: vendorCodes },
      result: 'NO_ORDER',
      noOrderReason: { not: null },
      arrivedAt: {
        gte: ymdToUtcDate(addDays(window.fromYmd, -1)),
        lte: ymdToUtcDate(addDays(window.toYmd, 2)),
      },
    },
    select: {
      vendorCode: true,
      arrivedAt: true,
      customerCode: true,
      loja: true,
      planItemId: true,
      noOrderReason: true,
    },
  })

  const inWindow = visits
    .map((visit) => ({ ...visit, ymd: ymdSaoPaulo(visit.arrivedAt) }))
    .filter((visit) => visit.ymd >= window.fromYmd && visit.ymd <= window.toYmd)
  if (inWindow.length === 0) return emptyDto(window)

  const customers = await prisma.customer.findMany({
    where: { companyId, protheusCode: { in: inWindow.map((v) => v.customerCode) } },
    select: { protheusCode: true, loja: true, name: true },
  })
  const customerByKey = new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))

  const facts: NoOrderFact[] = inWindow.map((visit) => {
    const customer = customerByKey.get(customerKey(visit))
    return {
      ymd: visit.ymd,
      vendorCode: visit.vendorCode,
      sellerName: nameByVendor.get(visit.vendorCode) ?? visit.vendorCode,
      customerName: customer?.name ?? visit.customerCode,
      reason: visit.noOrderReason as string,
      planned: visit.planItemId !== null,
    }
  })

  return { range: window, ...buildNoOrderReport(facts) }
}
