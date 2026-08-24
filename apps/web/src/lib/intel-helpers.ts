// Helpers puros das telas da Inteligência (E10) — testados em __tests__.

// ─── Pesos do ranking (W5): precisam somar 100 ───
export const WEIGHT_KEYS = ['weight_value', 'weight_urgency', 'weight_risk'] as const

export function weightsSum(values: Record<string, unknown>): number {
  return WEIGHT_KEYS.reduce((sum, key) => {
    const v = values[key]
    return sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  }, 0)
}

export function weightsValid(values: Record<string, unknown>): boolean {
  return weightsSum(values) === 100
}

// ─── Reconciliação (W3): diff % com sinal, vírgula decimal ───
export function formatDiffPct(diff: number | null | undefined): string {
  if (diff === null || diff === undefined || !Number.isFinite(diff)) return '—'
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(2).replace('.', ',')}%`
}

// ─── Carga inicial (P5): progresso do job SYNC de backfill ───
export interface BackfillProgress {
  contract: string
  done: number
  total: number
  pct: number
}

export function backfillProgress(metadata: unknown): BackfillProgress | null {
  if (!metadata || typeof metadata !== 'object') return null
  const m = metadata as { kind?: unknown; contract?: unknown; done?: unknown; total?: unknown }
  if (m.kind !== 'backfill') return null
  if (typeof m.done !== 'number' || typeof m.total !== 'number' || m.total <= 0) return null
  const done = Math.max(0, Math.min(m.done, m.total))
  return {
    contract: String(m.contract ?? ''),
    done,
    total: m.total,
    pct: Math.round((done / m.total) * 100),
  }
}

// ─── Período YYYYMM → MM/YYYY ───
export function periodLabel(period: string | null | undefined): string {
  if (!period || !/^\d{6}$/.test(period)) return '—'
  return `${period.slice(4)}/${period.slice(0, 4)}`
}

// ─── Valores monetários (strings Decimal da API) ───
export function brl(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Cidades atendidas: "Campinas, Valinhos" → ['Campinas','Valinhos'] ───
export function parseCities(text: string): string[] {
  return text
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}
