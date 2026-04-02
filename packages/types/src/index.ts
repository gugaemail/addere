// Tipos compartilhados entre API, web e mobile

// ─── Auth ──────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'SALESPERSON'

export interface JwtPayload {
  sub: string      // user id
  email: string
  role: UserRole
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
  createdAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: UserPublic
  accessToken: string
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  protheusCode: string | null
  name: string
  document: string | null
  email: string | null
  phone: string | null
  address: string | null
  active: boolean
  createdAt: string
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
}

export interface Order {
  id: string
  status: OrderStatus
  total: string
  notes: string | null
  protheusOrderId: string | null
  syncedAt: string | null
  createdAt: string
  customer: Pick<Customer, 'id' | 'name' | 'document'>
  items: OrderItemDetail[]
}

export interface CreateOrderItemInput {
  productId: string
  quantity: number
  discount?: number
}

export interface CreateOrderInput {
  customerId: string
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

// ─── Erros ─────────────────────────────────────────────────────────────────

export interface ApiError {
  message: string
  statusCode: number
}
