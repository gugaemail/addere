// Tipos compartilhados entre API, web e mobile
export type { FieldDefinition } from './field-registry'
export { FIELD_REGISTRY, FIELD_REGISTRY_KEYS } from './field-registry'

// ─── Auth ──────────────────────────────────────────────────────────────────

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'SALESPERSON'

export interface JwtPayload {
  sub: string        // user id
  email: string
  role: UserRole
  companyId: string | null  // null para SUPERADMIN
}

export interface AuthTokens {
  accessToken: string
}

export interface UserPublic {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  idVendProt: string | null
  createdAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: UserPublic
  accessToken: string
  refreshToken: string  // enviado no body para que o mobile persista no SecureStore
}

// ─── Company ───────────────────────────────────────────────────────────────

export interface Company {
  id:           string
  name:         string
  cnpj:         string
  idProtheus:   string | null
  active:       boolean
  apiToken:     string | null
  apiPord:      string | null
  apiCliente:   string | null
  apiMetaVend:  string | null
  apiPedido:    string | null
  apiConsPed:   string | null
  apiCondPag:   string | null
  apiTransp:    string | null
  usrProtheus:  string | null
  passProtheus: string | null
  syncConfig:   unknown | null
  createdAt:    string
}

// ─── Branch ────────────────────────────────────────────────────────────────

export interface Branch {
  id: string
  name: string
  cnpj: string | null
  idProtheus: string | null
  razaoSocial: string | null
  endereco: string | null
  complemento: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  logo: string | null
  active: boolean
}

// ─── Transportadora ────────────────────────────────────────────────────────

export interface Transportadora {
  id: string
  protheusCode: string | null
  nome: string
}

// ─── CondPag — condições de pagamento ─────────────────────────────────────

export interface CondPag {
  id: string
  protheusCode: string | null
  nome: string
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  protheusCode: string | null
  loja: string | null
  name: string
  document: string | null
  email: string | null
  phone: string | null
  address: string | null
  municipio: string | null
  bairro: string | null
  cep: string | null
  uf: string | null
  ultcom: string | null
  msblql: string | null
  transpPadrao: string | null
  condPagPadrao: string | null
  tes: string | null
  xcodemp: string | null
  active: boolean
  createdAt: string
}

export interface CustomerWithOrders extends Customer {
  orders: Order[]
}

// ─── Product ───────────────────────────────────────────────────────────────

export interface Product {
  id: string
  protheusCode: string | null
  name: string
  description: string | null
  price: string        // Decimal serializado como string
  unit: string
  stock: string        // Decimal serializado como string
  saldo: string        // Decimal serializado como string
  active: boolean
}

// ─── Order ─────────────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'SYNCED' | 'CANCELLED'

export interface OrderItemDetail {
  id: string
  productId: string
  product: Pick<Product, 'id' | 'name' | 'unit'>
  quantity: string
  unitPrice: string
  discount: string
  total: string
  descricao:    string | null
  largura:      string | null
  espessura:    string | null
  encolhimento: string | null
  xcrav:        string | null
  tara:         string | null
}

export interface Order {
  id: string
  status: OrderStatus
  total: string
  notes: string | null
  mennota: string | null
  protheusOrderId: string | null
  protheusStatus: string | null
  syncedAt: string | null
  emissao: string | null
  createdAt: string
  customer: Pick<Customer, 'id' | 'name' | 'document'>
  branch: { id: string; name: string; idProtheus: string | null } | null
  transportadora: { id: string; nome: string } | null
  condPag: { id: string; nome: string } | null
  items: OrderItemDetail[]
}

export interface CreateOrderItemInput {
  productId:    string
  quantity:     number
  discount?:    number
  descricao?:   string
  unitPrice?:   number
  largura?:     number
  espessura?:   number
  encolhimento?: string
  xcrav?:       string
  tara?:        number
}

export interface CreateOrderInput {
  customerId: string
  branchId: string
  transportId?: string
  condId?: string
  emissao?: string
  mennota?: string
  notes?: string
  items: CreateOrderItemInput[]
}

export interface UpdateOrderInput {
  transportId?: string
  condId?: string
  emissao?: string
  mennota?: string
  notes?: string
  items: CreateOrderItemInput[]
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalOrders: number
  pendingOrders: number
  syncedOrders: number
  totalRevenue: string  // Decimal serializado como string
}

// ─── Field Config ──────────────────────────────────────────────────────────

export interface CompanyFieldConfig {
  hidden: string[]    // lista de keys do FIELD_REGISTRY que estão ocultas para a empresa
  required: string[]  // lista de keys do FIELD_REGISTRY que são obrigatórias no formulário
}

// ─── Sync Schedule ─────────────────────────────────────────────────────────

export interface SyncScheduleEntity {
  interv:      number   // INTERV enviado ao Protheus (0 = todos, N = alterados nos últimos N min)
  scheduleMin: number   // intervalo de auto-sync em minutos (0 = desabilitado)
  auto:        boolean  // auto-sync ligado/desligado
}

export interface SyncSchedule {
  products:  SyncScheduleEntity
  customers: SyncScheduleEntity
}

export const DEFAULT_SYNC_SCHEDULE: SyncSchedule = {
  products:  { interv: 0, scheduleMin: 0, auto: false },
  customers: { interv: 0, scheduleMin: 0, auto: false },
}

// ─── Pilot ─────────────────────────────────────────────────────────────────

export type PilotStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export type PilotEventType =
  | 'ORDER_STARTED'
  | 'ORDER_COMPLETED'
  | 'ORDER_SYNCED'
  | 'ORDER_SYNC_FAILED'
  | 'SESSION_STARTED'
  | 'CATALOG_LOADED'

export interface Pilot {
  id: string
  clientName: string
  startDate: string
  endDate: string
  status: PilotStatus
  companyId: string
  createdAt: string
}

export interface PilotEventInput {
  type: PilotEventType
  metadata?: Record<string, unknown>
  occurredAt: string
}

export interface PilotFeedbackInput {
  orderId?: string
  rating: 'positive' | 'negative'
  comment?: string
}

export interface PilotMetrics {
  avgOrderDurationMs: number | null
  syncSuccessRate: number | null
  offlineOrderRate: number | null
  avgQueueDurationMs: number | null
  totalOrders: number
}

export interface PilotMetricDelta {
  current: number | null
  previous: number | null
  deltaPercent: number | null
}

export interface PilotDashboardMetrics {
  pilot: Pilot
  since: string
  avgOrderDuration: PilotMetricDelta
  syncSuccessRate: PilotMetricDelta
  offlineOrderRate: PilotMetricDelta
  avgQueueDuration: PilotMetricDelta
  totalOrders: PilotMetricDelta
  dailyOrders: Array<{ date: string; total: number; offline: number }>
  repActivity: Array<{
    repId: string
    repName: string
    ordersToday: number
    ordersTotal: number
    lastActiveAt: string | null
    syncRate: number | null
  }>
  recentNegativeFeedbacks: Array<{
    id: string
    repName: string
    comment: string | null
    createdAt: string
  }>
}

// ─── Erros ─────────────────────────────────────────────────────────────────

export interface ApiError {
  message: string
  statusCode: number
}
