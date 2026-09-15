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
  validatedByName: string | null // nome de quem validou (validatedBy é o id)
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
  probableCauses: string[] // concretas (detectadas nos dados) primeiro, depois as genéricas
  /** Como o Addere chegou ao calcAmount — para refazer a conta fora do Addere */
  audit?: ReconciliationAudit
}

export interface ReconciliationAudit {
  source: 'protheus' | 'mock' // mock = dados sintéticos, nada veio do ERP
  endpointHost: string | null // host do endpoint SQL, sem caminho nem credencial
  executedSql: string // SQL com os placeholders já substituídos
  window: { dataIni: string; dataFim: string } // YYYYMMDD
  branches: string[] // códigos usados em {{FILIAL}}
  rows: number
  pages: number
  pageSize: number | null
  truncated: boolean
  duplicateRows: number // linhas idênticas em todas as colunas
  duplicateKeys: number // pedido+item+produto repetidos (vendas)
  invalidValues: number // "valor" que não virou número (fica fora da soma)
  distinctOrders: number | null
  byDay: { date: string; rows: number; amount: string }[]
  branchColumn: string | null // coluna de filial encontrada no resultado, se houver
  byBranch: { branch: string; rows: number; amount: string }[]
  summary: string
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
  // Geocodificação (E15-F1) — CITY não posiciona pino; withoutPin = fora do mapa
  geocoding?: {
    byPrecision: Partial<Record<GeoPrecision, number>>
    failed: number
    withoutPin: number
  }
}

// ─── Premissas do motor (W5) ───

export interface IntelParameterDto {
  key: string
  value: unknown
  segment: string // '' = global
  changedBy: string | null
  changedByName: string | null
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
  // Fase 2 — roteirização (E16) e cross-sell (E19)
  route_by_distance: true, // ordena as paradas por vizinho-mais-próximo (senão, ordem do ranking)
  day_start_hour: 8, // hora (BRT) da primeira visita — base da hora prevista
  visit_minutes: 30, // duração média da visita, para a hora prevista das seguintes
  avg_speed_kmh: 30, // deslocamento urbano de carro (moto ×1.2; a pé 5 km/h)
  cross_sell_min_pct: 40, // produto entra no cross-sell quando ≥ N% dos pares o compram
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

// ═══ Parte 2 (motor, plano e execução; plano E1c) ═══

export type Vehicle = 'CAR' | 'MOTORCYCLE' | 'FOOT'
export type CustomerStatus = 'NEW' | 'ON_CYCLE' | 'LATE' | 'AT_RISK' | 'INACTIVE' | 'BLOCKED'
export type SignalConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type PlanKind = 'DAY' | 'WEEK'
export type PlanStatus = 'GENERATED' | 'EDITED' | 'IN_PROGRESS' | 'CLOSED'
export type PlanItemOrigin = 'ENGINE' | 'MANAGER' | 'SELLER'
export type MessageTemplate = 'STALLED_PROPOSAL' | 'WENT_QUIET' | 'REACTIVATE'
export type VisitResult = 'ORDER' | 'NO_ORDER' | 'NOT_FOUND' | 'RESCHEDULED'
export type FeedbackTargetType = 'PLAN' | 'ITEM' | 'MESSAGE' | 'ANSWER'
export type GeoPrecision = 'ROOFTOP' | 'STREET' | 'CEP' | 'CITY'

// Rótulos e cores ficam nos apps (tokens de tema); aqui só o domínio.

// Snapshot determinístico embarcado em cada item do plano — sustenta o
// "antes de entrar" offline (princípio 10 do doc; achado da revisão v0.2)
export interface SignalsSnapshot {
  status: CustomerStatus
  confidence: SignalConfidence
  cycleDays: number | null
  daysSinceLastPurchase: number | null
  orders12m: number
  avgTicket: string | null
  trendPct: number | null
  usualMix: { productCode: string; productDesc: string | null }[]
  cutMix: { productCode: string; productDesc: string | null }[]
  openTitles: { count: number; totalBalance: string; maxDaysOverdue: number | null }
  reasons: string[]
  // Fase 2 (E19) — opcionais: snapshots gravados antes da fase não os têm
  rfmSegment?: RfmSegment | null
  crossSell?: { productCode: string; productDesc: string | null; peersPct: number }[]
}

// Segmento RFM (E19) — quintis de recência, frequência e valor dentro da carteira
export type RfmSegment =
  | 'CHAMPION' // compra muito, sempre e faz pouco tempo
  | 'LOYAL' // frequência e valor altos, recência mediana
  | 'PROMISING' // recente, ainda com pouca frequência
  | 'NEED_ATTENTION' // tudo mediano — começa a escorregar
  | 'AT_RISK' // valia muito e sumiu
  | 'HIBERNATING' // pouco e há muito tempo
  | 'LOST' // o pior dos três

export interface VisitPlanItemDto {
  id: string
  position: number
  customerCode: string
  loja: string
  customerName: string // remontado pela API (não vive na tabela)
  customerAddress: string | null
  customerPhone: string | null
  statusAtTime: CustomerStatus
  shortReason: string | null
  suggestedOffer:
    | {
        productCode: string
        productDesc: string | null
        source: 'usual' | 'ask_about_cut' | 'cross_sell'
      }[]
    | null
  expectedAmount: string | null
  origin: PlanItemOrigin
  removedAt: string | null
  signals: SignalsSnapshot | null
  lat: number | null
  lng: number | null
  plannedTime: string | null // "08:30" — hora prevista (E16); null sem roteirização
  distFromPrevM: number | null // metros desde a parada anterior (E16)
  etaMin: number | null // minutos de deslocamento desde a parada anterior (E16)
  plannedDate: string | null // 'YYYY-MM-DD' — só no plano semanal (E18)
}

export interface VisitPlanDto {
  id: string
  date: string // 'YYYY-MM-DD'
  kind: PlanKind
  status: PlanStatus
  generatedAt: string
  grouping: string | null
  expectedAmount: string | null
  llmSummary: string | null // null = mostrar fallback determinístico
  items: VisitPlanItemDto[] // ordenados; BLOCKED ao final
  freshness: { lastSyncAt: string | null; stale: boolean } // pill "sinc. 03h12"
  goal: {
    goalAmount: string | null
    soldAmount: string | null
    gap: string | null
    perBusinessDay: string | null
    lateCoverage: string | null // Σ ticket×prob dos atrasados+risco
  } | null
}

export interface BriefingDto {
  customerCode: string
  loja: string
  signals: SignalsSnapshot
  text: string | null // 3 linhas do agente (null = montar do snapshot)
  freshness: { lastSyncAt: string | null }
}

export interface CustomerSignalListItem {
  customerCode: string
  loja: string
  customerName: string
  status: CustomerStatus
  daysSinceLastPurchase: number | null
  avgTicket: string | null
  reason: string | null
  // Fase 2 (E19) — Carteira
  cycleDays: number | null
  orders12m: number
  trendPct: number | null
  rfmSegment: RfmSegment | null
  city: string | null
  crossSellCount: number
}

// Carteira do vendedor (E19): resumo + lista + texto do agente (fallback só-motor)
export interface PortfolioDto {
  total: number
  byStatus: Partial<Record<CustomerStatus, number>>
  byRfm: Partial<Record<RfmSegment, number>>
  /** null quando a carteira tem menos de 30 clientes — quintil não faz sentido */
  rfmAvailable: boolean
  lateAmount: string // Σ ticket×prob dos atrasados+risco (o que dá para recuperar)
  items: CustomerSignalListItem[]
  text: string | null
  freshness: { lastSyncAt: string | null; stale: boolean }
}

// Janela de atendimento do cliente (E16)
export type WindowSource = 'CADASTRO' | 'SELLER' | 'MANAGER'

export interface CustomerWindowDto {
  weekday: number // 0=dom … 6=sáb
  startTime: string // "08:00"
  endTime: string // "12:00"
  source: WindowSource
}

// Estoque ao vivo (E22): contrato STOCK quando publicado; senão o saldo do sync
export interface StockDto {
  productCode: string
  saldo: string
  local: string | null
  source: 'live' | 'sync'
  checkedAt: string
}

export interface CustomerMessageDto {
  id: string
  customerCode: string
  loja: string
  template: MessageTemplate
  text: string
  generatedAt: string
  sentAt: string | null
}

// Idempotência offline: clientId gerado no app; único por tenant no banco
export interface VisitInput {
  clientId: string
  planItemId?: string | null
  customerCode: string
  loja: string
  arrivedAt: string
  lat?: number | null
  lng?: number | null
  accuracyM?: number | null
  result?: VisitResult | null
  noOrderReason?: string | null
  orderId?: string | null
  notes?: string | null
  createdOfflineAt?: string | null
}

export interface FeedbackInput {
  targetType: FeedbackTargetType
  targetId: string
  rating: 1 | -1
  comment?: string | null
}

// Operações de edição do plano (PATCH /intel/app/plans/:id/items)
export type PlanPatchOp =
  | { opId: string; type: 'reorder'; itemId: string; position: number }
  | { opId: string; type: 'remove'; itemId: string }
  | { opId: string; type: 'restore'; itemId: string }
  | { opId: string; type: 'skip'; itemId: string }
  | { opId: string; type: 'setGrouping'; grouping: string }
  // Plano semanal (E18): muda o dia da parada ('YYYY-MM-DD' dentro da semana)
  | { opId: string; type: 'moveToDay'; itemId: string; date: string }

// W1 — Equipe em campo (E8/E11)
export interface TeamSellerCard {
  vendorCode: string
  name: string
  grouping: string | null
  plannedVisits: number
  doneVisits: number
  offPlanVisits: number
  ordersCount: number
  ordersAmount: string
  startedAt: string | null
}

export interface TeamReportDto {
  date: string
  range: 'day' | 'week' | 'month'
  kpis: {
    plannedVisits: number
    doneVisits: number
    adherencePct: number | null
    visitPositivationPct: number | null // com pedido / realizadas
    portfolioPositivationPct: number | null // clientes que compraram no mês / carteira ativa
  }
  sellers: TeamSellerCard[]
  sellersWithoutManager: number // aviso da hierarquia D3b
  alerts: { kind: string; message: string; vendorCode?: string }[]
  freshness: { lastSyncAt: string | null }
}

// Home do gerente no app (decisão 1 do teste geral de 25/08/2026)
export interface ManagerHomeSellerDto {
  userId: string
  name: string
  vendorCode: string
  goalAmount: string | null
  soldAmount: string | null
  pct: number | null
  planned: number
  done: number
  adherencePct: number | null
}

export interface ManagerHomeDto {
  period: string // YYYYMM
  goal: {
    goalAmount: string | null
    soldAmount: string | null
    gap: string | null
    pct: number | null
    sellersWithGoal: number
  }
  today: { ymd: string; planned: number; done: number }
  sellers: ManagerHomeSellerDto[]
  lastSyncAt: string | null
}

// ═══ Fase 2 — painel do gerente ═══

// Mapa da equipe (E20): paradas do dia com coordenada + último check-in
export interface TeamMapStopDto {
  itemId: string
  position: number
  customerCode: string
  loja: string
  customerName: string
  status: CustomerStatus
  lat: number
  lng: number
  plannedTime: string | null
  visited: boolean // check-in registrado no item
}

export interface TeamMapSellerDto {
  userId: string
  name: string
  vendorCode: string
  grouping: string | null
  stops: TeamMapStopDto[]
  withoutPin: number // paradas do plano sem coordenada
  lastCheckIn: { lat: number; lng: number; at: string; customerName: string } | null
}

export interface TeamMapDto {
  date: string // 'YYYY-MM-DD'
  sellers: TeamMapSellerDto[]
  lastSyncAt: string | null
}

// Onde estou perdendo (E21): decomposição da queda de receita no período
export type LossKind =
  | 'STOPPED' // clientes que compravam e não compram mais
  | 'REDUCED' // clientes ativos comprando menos
  | 'PRODUCT_DROP' // produtos em queda
  | 'GAINED' // clientes novos/recuperados (positivo)

export interface LossComponentDto {
  kind: LossKind
  amount: string // negativo = perda
  count: number
}

export interface LossCustomerDto {
  customerCode: string
  loja: string
  customerName: string
  vendorCode: string | null
  status: CustomerStatus | null
  baselineAmount: string // média mensal do período-base
  currentAmount: string // no período atual
  diffAmount: string // current − baseline (negativo = perda)
  reason: string
  inPlanToday: boolean
}

export interface LossProductDto {
  productCode: string
  productDesc: string | null
  baselineAmount: string
  currentAmount: string
  diffPct: number | null
}

export interface LossesReportDto {
  period: { fromYmd: string; toYmd: string; baselineMonths: number }
  vendorCode: string | null // null = equipe inteira
  totals: { baselineAmount: string; currentAmount: string; diffAmount: string; diffPct: number | null }
  components: LossComponentDto[]
  customers: LossCustomerDto[] // maiores perdas primeiro
  products: LossProductDto[] // maiores quedas primeiro
  text: string | null // resumo do agente (fallback só-motor = null)
  lastSyncAt: string | null
}
