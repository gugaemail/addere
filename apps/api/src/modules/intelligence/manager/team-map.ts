// Mapa da equipe (E20, W1) — puro: paradas do dia com coordenada e o último
// check-in de cada vendedor. O service carrega, este módulo só monta.
import type { CustomerStatus, TeamMapDto, TeamMapSellerDto, TeamMapStopDto } from '@addere/types'

export interface MapSellerInput {
  userId: string
  name: string
  vendorCode: string
}

export interface MapPlanInput {
  vendorCode: string
  grouping: string | null
  items: {
    id: string
    position: number
    customerCode: string
    loja: string
    statusAtTime: CustomerStatus
    lat: number | null
    lng: number | null
    plannedTime: string | null
    removed: boolean
  }[]
}

export interface MapVisitInput {
  vendorCode: string
  planItemId: string | null
  customerCode: string
  loja: string
  arrivedAt: string // ISO
  lat: number | null
  lng: number | null
}

export interface TeamMapInput {
  date: string // 'YYYY-MM-DD'
  sellers: MapSellerInput[]
  plans: MapPlanInput[]
  visits: MapVisitInput[]
  nameByKey: Map<string, string>
  lastSyncAt: string | null
}

export function buildTeamMap(input: TeamMapInput): TeamMapDto {
  const planBy = new Map(input.plans.map((p) => [p.vendorCode, p]))
  const visitsBy = new Map<string, MapVisitInput[]>()
  for (const visit of input.visits) {
    const list = visitsBy.get(visit.vendorCode) ?? []
    list.push(visit)
    visitsBy.set(visit.vendorCode, list)
  }

  const sellers: TeamMapSellerDto[] = input.sellers.map((seller) => {
    const plan = planBy.get(seller.vendorCode)
    const visits = visitsBy.get(seller.vendorCode) ?? []
    const visitedItems = new Set(visits.map((v) => v.planItemId).filter((id): id is string => !!id))

    const active = (plan?.items ?? []).filter((i) => !i.removed)
    const stops: TeamMapStopDto[] = active
      .filter((i) => i.lat !== null && i.lng !== null)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        itemId: i.id,
        position: i.position,
        customerCode: i.customerCode,
        loja: i.loja,
        customerName: input.nameByKey.get(`${i.customerCode}|${i.loja}`) ?? i.customerCode,
        status: i.statusAtTime,
        lat: i.lat as number,
        lng: i.lng as number,
        plannedTime: i.plannedTime,
        visited: visitedItems.has(i.id),
      }))

    // Último check-in com GPS — o ponto onde o vendedor esteve por último
    const last = visits
      .filter((v) => v.lat !== null && v.lng !== null)
      .sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt))[0]

    return {
      userId: seller.userId,
      name: seller.name,
      vendorCode: seller.vendorCode,
      grouping: plan?.grouping ?? null,
      stops,
      withoutPin: active.length - stops.length,
      lastCheckIn: last
        ? {
            lat: last.lat as number,
            lng: last.lng as number,
            at: last.arrivedAt,
            customerName: input.nameByKey.get(`${last.customerCode}|${last.loja}`) ?? last.customerCode,
          }
        : null,
    }
  })

  return { date: input.date, sellers, lastSyncAt: input.lastSyncAt }
}
