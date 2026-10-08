// Atendimento à distância (plano 011): visita registrada por telefone ou
// WhatsApp, sem GPS. Puro — testado em __tests__/remoteVisit.test.ts.
import type { ContactChannel, VisitPlanItemDto, VisitResult, VisitSource } from '@addere/types'

/** Check-in remoto: sem posição (a do vendedor não diz nada do cliente) */
export function remoteCheckInPayload(
  item: Pick<VisitPlanItemDto, 'id' | 'customerCode' | 'loja'>,
  clientId: string,
  arrivedAt: string
) {
  return {
    clientId,
    planItemId: item.id,
    customerCode: item.customerCode,
    loja: item.loja,
    arrivedAt,
    lat: null,
    lng: null,
    accuracyM: null,
    source: 'REMOTE' as const,
    channel: null as ContactChannel | null,
  }
}

const RESULTS: { key: VisitResult; label: string }[] = [
  { key: 'ORDER', label: 'Fiz pedido' },
  { key: 'NO_ORDER', label: 'Sem pedido' },
  { key: 'NOT_FOUND', label: 'Não estava' },
  { key: 'RESCHEDULED', label: 'Reagendou' },
]

/** Os 4 resultados de sempre; à distância, "Não estava" vira "Não atendeu" */
export function resultOptions(remote: boolean): { key: VisitResult; label: string }[] {
  if (!remote) return RESULTS
  return RESULTS.map((r) => (r.key === 'NOT_FOUND' ? { ...r, label: 'Não atendeu' } : r))
}

export type VisitMark = 'visited' | 'remote'

/**
 * Marca de cada parada a partir das visitas na fila deste aparelho: "remote"
 * só quando todas foram à distância — ligou e depois foi lá vale "visited",
 * como no servidor (presencial > à distância).
 */
export function visitMarksByItem(
  entries: { type: string; payload: unknown }[]
): Map<string, VisitMark> {
  const marks = new Map<string, VisitMark>()
  for (const entry of entries) {
    if (entry.type !== 'visit') continue
    const payload = entry.payload as { planItemId?: string | null; source?: VisitSource }
    if (!payload?.planItemId) continue
    const mark: VisitMark = payload.source === 'REMOTE' ? 'remote' : 'visited'
    if (marks.get(payload.planItemId) !== 'visited') marks.set(payload.planItemId, mark)
  }
  return marks
}
