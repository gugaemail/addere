export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'SALESPERSON';
export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    companyId: string | null;
}
export interface AuthTokens {
    accessToken: string;
}
export interface UserPublic {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
    idVendProt: string | null;
    createdAt: string;
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface LoginResponse {
    user: UserPublic;
    accessToken: string;
}
export interface Company {
    id: string;
    name: string;
    cnpj: string;
    idProtheus: string | null;
    active: boolean;
    apiToken: string | null;
    apiPord: string | null;
    apiCliente: string | null;
    apiMetaVend: string | null;
    apiPedido: string | null;
    apiConsPed: string | null;
    apiCondPag: string | null;
    apiTransp: string | null;
    usrProtheus: string | null;
    passProtheus: string | null;
    syncConfig: unknown | null;
    createdAt: string;
}
export interface Branch {
    id: string;
    name: string;
    cnpj: string | null;
    idProtheus: string | null;
    active: boolean;
}
export interface Transportadora {
    id: string;
    protheusCode: string | null;
    nome: string;
}
export interface CondPag {
    id: string;
    protheusCode: string | null;
    nome: string;
}
export interface Customer {
    id: string;
    protheusCode: string | null;
    loja: string | null;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    municipio: string | null;
    bairro: string | null;
    cep: string | null;
    uf: string | null;
    ultcom: string | null;
    active: boolean;
    createdAt: string;
}
export interface CustomerWithOrders extends Customer {
    orders: Order[];
}
export interface Product {
    id: string;
    protheusCode: string | null;
    name: string;
    description: string | null;
    price: string;
    unit: string;
    stock: string;
    saldo: string;
    active: boolean;
}
export type OrderStatus = 'PENDING' | 'SYNCED' | 'CANCELLED';
export interface OrderItemDetail {
    id: string;
    productId: string;
    product: Pick<Product, 'id' | 'name' | 'unit'>;
    quantity: string;
    unitPrice: string;
    discount: string;
    total: string;
    descricao: string | null;
}
export interface Order {
    id: string;
    status: OrderStatus;
    total: string;
    notes: string | null;
    protheusOrderId: string | null;
    syncedAt: string | null;
    emissao: string | null;
    mennota: string | null;
    createdAt: string;
    customer: Pick<Customer, 'id' | 'name' | 'document'>;
    items: OrderItemDetail[];
}
export interface CreateOrderItemInput {
    productId: string;
    quantity: number;
    discount?: number;
    descricao?: string;
    unitPrice?: number;
}
export interface CreateOrderInput {
    customerId: string;
    branchId: string;
    transportId?: string;
    condId?: string;
    emissao?: string;
    mennota?: string;
    notes?: string;
    items: CreateOrderItemInput[];
}
export interface DashboardStats {
    totalOrders: number;
    pendingOrders: number;
    syncedOrders: number;
    totalRevenue: string;
}
export interface ApiError {
    message: string;
    statusCode: number;
}
//# sourceMappingURL=index.d.ts.map