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

// ─── Empresa ativa ───
// As rotas /intel/admin/* resolvem o tenant pelo `companyId`, que o SUPERADMIN
// escolhe na sidebar. Sem ele a resposta vem vazia e as telas mostravam um
// estado genérico ("Sem dados de saúde") que manda procurar problema no banco.
export function needsActiveCompany(isSuperAdmin: boolean, companyId: string | null): boolean {
  return isSuperAdmin && !companyId
}

// ─── Equipe em campo (W1/E11) ───

// A API devolve null quando não há denominador — "sem plano gerado" e "0% de
// aderência" são coisas diferentes na tela do gerente, e virar 0 acusaria o
// vendedor de algo que não aconteceu.
export function pctLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${String(value).replace('.', ',')}%`
}

/** Pontos percentuais com sinal (lift da conversão sugerida vs. fora do plano). */
export function ppLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${String(value).replace('.', ',')} p.p.`
}

/** 'YYYYMMDD' → 'DD/MM'; com ano quando o período cruza anos. */
export function dayLabel(ymd: string, withYear = false): string {
  if (!/^\d{8}$/.test(ymd)) return '—'
  const base = `${ymd.slice(6, 8)}/${ymd.slice(4, 6)}`
  return withYear ? `${base}/${ymd.slice(0, 4)}` : base
}

/** Cabeçalho do período: um dia aparece sozinho, um intervalo vira "de … a …". */
export function rangeLabel(range: { fromYmd: string; toYmd: string }): string {
  const crossesYear = range.fromYmd.slice(0, 4) !== range.toYmd.slice(0, 4)
  if (range.fromYmd === range.toYmd) return dayLabel(range.fromYmd, true)
  return `${dayLabel(range.fromYmd, crossesYear)} a ${dayLabel(range.toYmd, true)}`
}

/** 'YYYY-MM-DD' do dia civil em São Paulo — o input date e a query usam esse formato. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
