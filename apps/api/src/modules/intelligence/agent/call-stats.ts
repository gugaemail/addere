// Leitura do registro de chamadas do agente (plano 012) — puro.
// Alimenta a tela de saúde e o alarme do noturno: as duas vezes em que o
// agente caiu inteiro para só-motor (o Hoje desde a v1; 25 a 30/09) passaram
// dias sem ninguém ver, porque as falhas não eram registradas em lugar nenhum.
import type { AgentCallStats, AgentKindHealth } from '@addere/types'

export interface CallRow {
  kind: string
  source: string // 'llm' | 'cache' | 'engine'
  reason: string | null
  createdAt: Date
}

const DAY_MS = 86_400_000
const TOP_REASONS = 3

/** Abaixo disso a taxa de só-motor é ruído — não dispara alarme. */
export const ALARM_MIN_CALLS = 10
/** Mais da metade das gerações em só-motor nas últimas 24 h = alarme. */
export const ALARM_ENGINE_SHARE = 0.5

function emptyStats(): AgentCallStats {
  return { calls: 0, llm: 0, cache: 0, engine: 0 }
}

function add(stats: AgentCallStats, source: string): void {
  stats.calls++
  if (source === 'llm') stats.llm++
  else if (source === 'cache') stats.cache++
  else stats.engine++
}

/** Por tipo de texto: últimas 24 h, últimos 7 dias e os motivos de só-motor mais comuns. */
export function summarizeAgentCalls(rows: CallRow[], now: Date = new Date()): AgentKindHealth[] {
  const dayAgo = now.getTime() - DAY_MS
  const weekAgo = now.getTime() - 7 * DAY_MS
  const byKind = new Map<
    string,
    { last24h: AgentCallStats; last7d: AgentCallStats; reasons: Map<string, number> }
  >()

  for (const row of rows) {
    const at = row.createdAt.getTime()
    if (at < weekAgo) continue
    let entry = byKind.get(row.kind)
    if (!entry) {
      entry = { last24h: emptyStats(), last7d: emptyStats(), reasons: new Map() }
      byKind.set(row.kind, entry)
    }
    add(entry.last7d, row.source)
    if (at >= dayAgo) add(entry.last24h, row.source)
    if (row.source === 'engine') {
      const reason = row.reason ?? 'desconhecido'
      entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + 1)
    }
  }

  return [...byKind.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([kind, entry]) => ({
      kind,
      last24h: entry.last24h,
      last7d: entry.last7d,
      topReasons: [...entry.reasons.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, TOP_REASONS)
        .map(([reason, count]) => ({ reason, count })),
    }))
}

/**
 * Alarme das últimas 24 h, todos os tipos somados. `llm_off` não conta: é o
 * agente desligado de propósito, não quebrado. Devolve null quando está tudo bem.
 */
export function engineShareAlarm(
  rows: CallRow[],
  now: Date = new Date()
): { calls: number; engine: number; reasons: Record<string, number> } | null {
  const dayAgo = now.getTime() - DAY_MS
  const recent = rows.filter((r) => r.createdAt.getTime() >= dayAgo && r.reason !== 'llm_off')
  if (recent.length < ALARM_MIN_CALLS) return null
  const engine = recent.filter((r) => r.source === 'engine')
  if (engine.length / recent.length <= ALARM_ENGINE_SHARE) return null
  const reasons: Record<string, number> = {}
  for (const row of engine) {
    const reason = row.reason ?? 'desconhecido'
    reasons[reason] = (reasons[reason] ?? 0) + 1
  }
  return { calls: recent.length, engine: engine.length, reasons }
}
