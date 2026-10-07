// Conversão em reais por origem da visita (plano 004) — GET /intel/manager/conversion.
// Carrega as visitas da janela (mesma técnica de rede larga em UTC + recorte
// por dia civil de São Paulo de loadVisits em manager.service.ts), concilia
// cada uma com um Order e delega a agregação a conversion.ts (puro).
//
// Conciliação (passo 3 do plano): quando a visita já tem `orderId` (passo 1,
// escrito pelo app desde o plano 006), o vínculo é forte — um único
// `findMany` com `id: { in: orderIds }` resolve todas de uma vez. Para as
// visitas antigas, sem `orderId`, procura um Order do mesmo cliente, mesmo
// vendedor, mesmo dia civil — se achar mais de um, soma todos (o vendedor
// atendeu uma vez e fez dois pedidos). Um Order já consumido por um vínculo
// forte nunca entra nesse segundo lote, para não ser contado duas vezes.
import { prisma } from '@addere/db'
import type { ConversionReportDto } from '@addere/types'
import { ymdSaoPaulo } from '../engine/business-days'
import type { ViewerScope } from '../../users/data-scope'
import { loadSellers } from './manager.service'
import { buildConversionReport, type VisitValueFact } from './conversion'
import { addDays, ymdToUtcDate, type DateWindow } from './range'

const DEFAULT_LOJA = '01'

interface DateOrderRow {
  id: string
  total: unknown // Decimal — convertido com Number() antes de sair daqui
  status: string
  createdAt: Date
}

function dateOrderKey(vendorCode: string, customerCode: string, loja: string, ymd: string): string {
  return `${vendorCode}|${customerCode}|${loja}|${ymd}`
}

function emptyDto(window: DateWindow): ConversionReportDto {
  return buildConversionReport({ fromYmd: window.fromYmd, toYmd: window.toYmd, facts: [] })
}

export async function buildTeamConversionReport(
  companyId: string,
  scope: ViewerScope,
  fromYmd: string,
  toYmd: string
): Promise<ConversionReportDto> {
  const window: DateWindow = { fromYmd, toYmd }

  // sellerWhere já é o recorte de equipe único (plano 007) — um gerente só
  // recebe vendorCodes da própria equipe, então nenhuma query abaixo
  // consegue enxergar pedido de vendedor de fora dela.
  const sellers = await loadSellers(companyId, scope)
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  if (vendorCodes.length === 0) return emptyDto(window)

  // Rede larga em UTC (±1/2 dias) e recorte fino pelo dia civil de São Paulo
  // — mesma técnica de loadVisits em manager.service.ts.
  const visits = await prisma.visit.findMany({
    where: {
      companyId,
      vendorCode: { in: vendorCodes },
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
      orderId: true,
    },
  })

  const inWindow = visits
    .map((visit) => ({ ...visit, ymd: ymdSaoPaulo(visit.arrivedAt) }))
    .filter((visit) => visit.ymd >= window.fromYmd && visit.ymd <= window.toYmd)

  if (inWindow.length === 0) return emptyDto(window)

  // Vínculo forte: Visit.orderId não nulo — um único round-trip, nunca uma
  // query por visita.
  const strongOrderIds = [
    ...new Set(inWindow.map((v) => v.orderId).filter((id): id is string => id !== null)),
  ]
  const strongOrders = strongOrderIds.length
    ? await prisma.order.findMany({
        where: { companyId, id: { in: strongOrderIds } },
        select: { id: true, total: true, status: true },
      })
    : []
  const strongOrderById = new Map(strongOrders.map((o) => [o.id, o]))

  // Conciliação por data: só roda quando existe pelo menos uma visita sem
  // vínculo forte, e só busca Order dos vendedores do escopo (o filtro por
  // cliente+vendedor+dia é feito em memória logo abaixo).
  const needsDateReconciliation = inWindow.some((v) => v.orderId === null)
  const dateOrders: Array<DateOrderRow & { vendorCode: string | null; customerCode: string | null; loja: string | null }> =
    needsDateReconciliation
      ? await prisma.order.findMany({
          where: {
            companyId,
            user: { idVendProt: { in: vendorCodes } },
            createdAt: {
              gte: ymdToUtcDate(addDays(window.fromYmd, -1)),
              lte: ymdToUtcDate(addDays(window.toYmd, 2)),
            },
          },
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            user: { select: { idVendProt: true } },
            customer: { select: { protheusCode: true, loja: true } },
          },
        }).then((rows) =>
          rows.map((row) => ({
            id: row.id,
            total: row.total,
            status: row.status,
            createdAt: row.createdAt,
            vendorCode: row.user.idVendProt,
            customerCode: row.customer.protheusCode,
            loja: row.customer.loja,
          }))
        )
      : []

  const dateOrdersByKey = new Map<string, DateOrderRow[]>()
  for (const order of dateOrders) {
    if (strongOrderById.has(order.id)) continue // já consumido por vínculo forte
    if (!order.vendorCode || !order.customerCode) continue
    const key = dateOrderKey(
      order.vendorCode,
      order.customerCode,
      order.loja ?? DEFAULT_LOJA,
      ymdSaoPaulo(order.createdAt)
    )
    const list = dateOrdersByKey.get(key) ?? []
    list.push({ id: order.id, total: order.total, status: order.status, createdAt: order.createdAt })
    dateOrdersByKey.set(key, list)
  }

  // Lote de expectedAmount: VisitPlanItem dos planItemId presentes, nunca
  // uma consulta por visita.
  const planItemIds = [
    ...new Set(inWindow.map((v) => v.planItemId).filter((id): id is string => id !== null)),
  ]
  const planItems = planItemIds.length
    ? await prisma.visitPlanItem.findMany({
        where: { id: { in: planItemIds } },
        select: { id: true, expectedAmount: true },
      })
    : []
  const expectedById = new Map(
    planItems.map((p) => [p.id, p.expectedAmount === null ? null : Number(p.expectedAmount)])
  )

  const facts: VisitValueFact[] = inWindow.map((visit) => {
    const planned = visit.planItemId !== null
    const expectedAmount = visit.planItemId !== null ? expectedById.get(visit.planItemId) ?? null : null

    if (visit.orderId !== null) {
      const order = strongOrderById.get(visit.orderId)
      // Order.id órfão (não achado) é tratado como 'none': não há nada para
      // mostrar, e um vínculo forte "vazio" não deve contar no rodapé.
      if (!order) {
        return { ymd: visit.ymd, vendorCode: visit.vendorCode, planned, orderTotal: null, expectedAmount, link: 'none' }
      }
      const orderTotal = order.status === 'CANCELLED' ? null : Number(order.total)
      return { ymd: visit.ymd, vendorCode: visit.vendorCode, planned, orderTotal, expectedAmount, link: 'strong' }
    }

    const loja = visit.loja ?? DEFAULT_LOJA
    const key = dateOrderKey(visit.vendorCode, visit.customerCode, loja, visit.ymd)
    const matches = dateOrdersByKey.get(key)
    if (!matches || matches.length === 0) {
      return { ymd: visit.ymd, vendorCode: visit.vendorCode, planned, orderTotal: null, expectedAmount, link: 'none' }
    }
    const nonCancelled = matches.filter((o) => o.status !== 'CANCELLED')
    const orderTotal =
      nonCancelled.length > 0 ? nonCancelled.reduce((sum, o) => sum + Number(o.total), 0) : null
    return { ymd: visit.ymd, vendorCode: visit.vendorCode, planned, orderTotal, expectedAmount, link: 'byDate' }
  })

  return buildConversionReport({ fromYmd: window.fromYmd, toYmd: window.toYmd, facts })
}
