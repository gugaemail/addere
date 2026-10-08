// Linha de uma visita no histórico da equipe (Equipe em campo). Mesma regra do
// app (apps/mobile/src/utils/visitHistory.ts).
import type { ContactChannel, VisitHistoryItemDto } from '@addere/types'

function timeInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Atendimento à distância (plano 011): o canal no lugar da duração */
export function remoteContactLabel(channel: ContactChannel | null): string {
  if (channel === 'PHONE') return 'por telefone'
  if (channel === 'WHATSAPP') return 'por WhatsApp'
  return 'à distância'
}

/** "08:12 · 24 min" — sem leftAt, só a hora; visita nascida do pedido
 * (source ORDER, plano 006) não tem GPS/duração por desenho: "registrada
 * pelo pedido" no lugar do tempo, nunca "0 min". À distância (REMOTE, plano
 * 011) não houve permanência no cliente: o canal, nunca a duração. */
export function visitMetaLine(
  item: Pick<VisitHistoryItemDto, 'arrivedAt' | 'durationMin' | 'source' | 'channel'>
): string {
  const time = timeInSaoPaulo(item.arrivedAt)
  if (item.source === 'ORDER') return `${time} · registrada pelo pedido`
  if (item.source === 'REMOTE') return `${time} · ${remoteContactLabel(item.channel)}`
  if (item.durationMin === null) return time
  return `${time} · ${item.durationMin} min`
}
