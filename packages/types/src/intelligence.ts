// Tipos da camada de Inteligência — parte 1 (ingestão; plano E1b).
// Convenções: Decimal serializado como string, datas como ISO string (padrão do pacote).

// ─── Enums (espelham os enums Prisma) ───

export type IntelQueryName = 'CUSTOMERS' | 'SALES' | 'OPEN_TITLES' | 'PRODUCTS' | 'STOCK'
export type IntelQueryScope = 'ALL' | 'PER_SELLER'
export type IntelJob =
  'NIGHTLY' | 'REFRESH' | 'SYNC' | 'GOALS' | 'ENGINE' | 'PLAN' | 'GEO' | 'PURGE' | 'EVAL'
export type IntelJobRunStatus = 'RUNNING' | 'OK' | 'ERROR'

// ─── Consultas (W3) ───

export interface IntelQueryDto {
  id: string
  name: IntelQueryName
  scope: IntelQueryScope
  sql: string
  definition: string | null
  exclusions: string | null
  gotchas: string | null
  version: number
  validatedAt: string | null
  validatedBy: string | null
  reconciliationPeriod: string | null // 'YYYYMM'
  reconciliationRefAmount: string | null
  reconciliationCalcAmount: string | null
  reconciliationDiffPct: number | null
  published: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

// Checagem individual exibida na aba "Validar e publicar"
export interface QueryCheck {
  key: string // ex: 'sql_guard', 'required_columns', 'placeholders', 'preview_time', 'fan_out'
  label: string
  ok: boolean
  detail?: string
}

export interface QueryPreviewResult {
  ok: boolean
  error?: string // presente quando ok=false (mensagem sanitizada, nunca corpo do ERP)
  checks: QueryCheck[]
  columns: string[]
  rows: Record<string, string | number | null>[] // ≤ 50 linhas
  stats: { rows: number; distinctOrders?: number; distinctCustomers?: number }
  ms: number
}

export interface ReconciliationResult {
  ok: boolean
  period: string // 'YYYYMM'
  refAmount: string
  calcAmount: string
  diffPct: number
  withinTolerance: boolean
  probableCauses: string[] // ordenadas por heurística
}

// ─── Jobs e saúde (W4) ───

export interface IntelJobRunDto {
  id: string
  job: IntelJob
  status: IntelJobRunStatus
  startedAt: string
  finishedAt: string | null
  error: string | null
}

export interface HealthReport {
  healthyPct: number
  freshness: { job: IntelJob; lastRunAt: string | null; lastStatus: IntelJobRunStatus | null }[]
  nextSyncAt: string | null
  customersWithoutCity: { count: number; pct: number; codes: string[] }
  salesWithoutVendor: { count: number; pct: number; refs: string[] }
  salesWithUnknownCustomer: { count: number; refs: string[] }
  recentRuns: IntelJobRunDto[] // últimos 7 dias
  llmUsageMonth?: { inputTokens: number; outputTokens: number; calls: number }
}

// ─── Premissas do motor (W5) ───

export interface IntelParameterDto {
  key: string
  value: unknown
  segment: string // '' = global
  changedBy: string | null
  updatedAt: string
}

// Defaults do doc de arquitetura §4.5 + decisões D8a/D8b — editáveis por tenant
export const DEFAULT_INTEL_PARAMETERS = {
  late_factor: 1.3, // atrasado a partir de 1,3× o ciclo
  risk_factor: 2.0, // em risco a partir de 2× o ciclo
  risk_days: 90, // …ou 90 dias sem compra
  active_days: 120, // cliente ativo = comprou em 120 dias
  cycle_min_orders: 3, // ciclo confiável a partir de 3 pedidos
  blocked_days: 5, // bloqueia por título vencido há 5 dias
  visits_per_day: 8, // capacidade padrão de visitas/dia
  group_by: 'city', // 'city' | 'district'
  saturday_workday: false,
  max_same_status_pct: 60, // diversidade do plano
  weight_value: 40,
  weight_urgency: 35,
  weight_risk: 25,
  visited_cooldown_days: 7, // D8a — parametrizável por empresa
  reconciliation_tolerance_pct: 2,
} as const

export type IntelParameterKey = keyof typeof DEFAULT_INTEL_PARAMETERS

// ─── Configuração da camada por empresa (Company.intelligenceConfig) ───

export interface IntelligenceConfig {
  syncHour: number // hora BRT do job noturno (D5a)
  syncEveryHours: number // intervalo do refresh (D5a)
  defaultTone: 'informal' | 'formal' // tom padrão das mensagens
  retentionDays: number // retenção de textos (D4)
  lgpdNoticeAcceptedAt: string | null
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  syncHour: 3,
  syncEveryHours: 4,
  defaultTone: 'informal',
  retentionDays: 365,
  lgpdNoticeAcceptedAt: null,
}
