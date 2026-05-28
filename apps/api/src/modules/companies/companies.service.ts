import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { encryptCredential, decryptCredential } from '../../lib/protheus-crypto'
import { invalidateToken } from '../sync/protheus.client'

const MAX_PAGE_SIZE = 500

// ─── Companies ────────────────────────────────────────────────────────────────

export async function listCompanies() {
  return prisma.company.findMany({
    orderBy: { name: 'asc' },
    take: 200,
    include: {
      _count: { select: { users: true, branches: true, orders: true } },
    },
  })
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      branches: { orderBy: { name: 'asc' } },
      users: {
        where: { active: true },
        select: { id: true, name: true, email: true, role: true, active: true, idVendProt: true, createdAt: true },
        orderBy: { name: 'asc' },
      },
      _count: { select: { orders: true } },
    },
  })

  if (!company) throw new Error('Empresa não encontrada')

  // Nunca expõe a senha; retorna null para não vazar nem o valor criptografado
  return { ...company, passProtheus: company.passProtheus ? '••••••••' : null }
}

export interface CreateCompanyInput {
  name: string
  cnpj: string
  idProtheus?: string
}

export async function createCompany(input: CreateCompanyInput) {
  return prisma.company.create({ data: input })
}

export async function toggleCompanyActive(id: string, active: boolean) {
  return prisma.company.update({ where: { id }, data: { active } })
}

export async function updateCompany(id: string, input: { name?: string; cnpj?: string; idProtheus?: string | null }) {
  return prisma.company.update({ where: { id }, data: input })
}

export interface UpdateCompanyProtheusInput {
  apiToken?:     string
  apiPord?:      string
  apiCliente?:   string
  apiPedido?:    string
  apiConsPed?:   string
  apiCondPag?:   string
  apiTransp?:    string
  apiMetaVend?:  string
  usrProtheus?:  string
  passProtheus?: string
  syncConfig?:   Record<string, unknown>
}

export async function updateCompanyProtheus(id: string, input: UpdateCompanyProtheusInput) {
  const data: Record<string, unknown> = {}

  if (input.apiToken    !== undefined) data.apiToken    = input.apiToken    || null
  if (input.apiPord     !== undefined) data.apiPord     = input.apiPord     || null
  if (input.apiCliente  !== undefined) data.apiCliente  = input.apiCliente  || null
  if (input.apiPedido   !== undefined) data.apiPedido   = input.apiPedido   || null
  if (input.apiConsPed  !== undefined) data.apiConsPed  = input.apiConsPed  || null
  if (input.apiCondPag  !== undefined) data.apiCondPag  = input.apiCondPag  || null
  if (input.apiTransp   !== undefined) data.apiTransp   = input.apiTransp   || null
  if (input.apiMetaVend !== undefined) data.apiMetaVend = input.apiMetaVend || null
  if (input.usrProtheus !== undefined) data.usrProtheus = input.usrProtheus || null
  if (input.syncConfig  !== undefined) data.syncConfig  = input.syncConfig

  // Criptografa a senha antes de gravar
  if (input.passProtheus !== undefined) {
    data.passProtheus = input.passProtheus ? encryptCredential(input.passProtheus) : null
  }

  const company = await prisma.company.update({ where: { id }, data })

  // Invalida token em cache se credenciais de autenticação mudaram
  const credentialChanged = input.apiToken !== undefined || input.usrProtheus !== undefined || input.passProtheus !== undefined
  if (credentialChanged) invalidateToken(id)

  return { ...company, passProtheus: company.passProtheus ? '••••••••' : null }
}

// ─── Sync Schedule ───────────────────────────────────────────────────────────

import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'

export async function getSyncSchedule(companyId: string): Promise<SyncSchedule> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { syncSchedule: true } })
  const s = company?.syncSchedule as Partial<SyncSchedule> | null
  return {
    products:  { ...DEFAULT_SYNC_SCHEDULE.products,  ...(s?.products  ?? {}) },
    customers: { ...DEFAULT_SYNC_SCHEDULE.customers, ...(s?.customers ?? {}) },
  }
}

export async function updateSyncSchedule(companyId: string, schedule: SyncSchedule): Promise<SyncSchedule> {
  await prisma.company.update({ where: { id: companyId }, data: { syncSchedule: schedule as object } })
  return schedule
}

// ─── Field Config ────────────────────────────────────────────────────────────

export async function getCompanyFieldConfig(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { fieldConfig: true } })
  const cfg = company?.fieldConfig as { hidden?: string[]; required?: string[] } | null
  return { hidden: cfg?.hidden ?? [], required: cfg?.required ?? [] }
}

export async function updateCompanyFieldConfig(companyId: string, hidden: string[], required: string[]) {
  await prisma.company.update({ where: { id: companyId }, data: { fieldConfig: { hidden, required } } })
  return { hidden, required }
}

// ─── Customers (por empresa) ─────────────────────────────────────────────────

export async function listCompanyCustomers(companyId: string, limit?: number, page?: number) {
  const take = Math.min(limit ?? 200, MAX_PAGE_SIZE)
  const skip = page && page > 1 ? (page - 1) * take : 0
  return prisma.customer.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
    take,
    skip,
  })
}

// ─── Products (por empresa) ───────────────────────────────────────────────────

export async function listCompanyProducts(companyId: string, limit?: number, page?: number) {
  const take = Math.min(limit ?? 200, MAX_PAGE_SIZE)
  const skip = page && page > 1 ? (page - 1) * take : 0
  return prisma.product.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
    take,
    skip,
  })
}

// ─── Orders (por empresa) ─────────────────────────────────────────────────────

export async function listCompanyOrders(companyId: string, limit?: number, page?: number) {
  const take = Math.min(limit ?? 100, MAX_PAGE_SIZE)
  const skip = page && page > 1 ? (page - 1) * take : 0
  return prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    include: {
      customer: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      items: {
        include: { product: { select: { id: true, name: true, unit: true } } },
      },
    },
  })
}

// ─── Branches ────────────────────────────────────────────────────────────────

export interface CreateBranchInput {
  name: string
  cnpj?: string
  idProtheus?: string
}

export async function createBranch(companyId: string, input: CreateBranchInput) {
  return prisma.branch.create({ data: { ...input, companyId } })
}

export async function toggleBranchActive(companyId: string, id: string, active: boolean) {
  const exists = await prisma.branch.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Filial não encontrada')
  return prisma.branch.update({ where: { id }, data: { active } })
}

// ─── Users (por empresa) ────────────────────────────────────────────────────

export interface CreateUserInput {
  name:       string
  email:      string
  password:   string
  role:       'ADMIN' | 'SALESPERSON'
  idVendProt?: string | null
}

export async function createUser(companyId: string, input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: { ...input, password: passwordHash, companyId, idVendProt: input.idVendProt ?? null },
    select: { id: true, name: true, email: true, role: true, active: true, idVendProt: true, createdAt: true },
  })
}

export async function toggleUserActive(companyId: string, id: string, active: boolean) {
  const exists = await prisma.user.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Usuário não encontrado')
  // Ao desativar, invalida todas as sessões ativas
  if (!active) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
  }
  return prisma.user.update({
    where: { id },
    data: { active },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
}

// ─── Branches (update) ───────────────────────────────────────────────────────

export interface UpdateBranchInput {
  name?: string
  cnpj?: string
  idProtheus?: string
}

export async function updateBranch(companyId: string, id: string, input: UpdateBranchInput) {
  const exists = await prisma.branch.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Filial não encontrada')
  const data: Record<string, unknown> = {}
  if (input.name        !== undefined) data.name        = input.name
  if (input.cnpj        !== undefined) data.cnpj        = input.cnpj        || null
  if (input.idProtheus  !== undefined) data.idProtheus  = input.idProtheus  || null
  return prisma.branch.update({ where: { id }, data })
}

// ─── Users (update) ──────────────────────────────────────────────────────────

export interface UpdateUserInput {
  name?:       string
  email?:      string
  password?:   string
  role?:       'ADMIN' | 'SALESPERSON'
  idVendProt?: string | null
}

export async function updateUser(companyId: string, id: string, input: UpdateUserInput) {
  const exists = await prisma.user.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Usuário não encontrado')
  const data: Record<string, unknown> = {}
  if (input.name       !== undefined) data.name       = input.name
  if (input.email      !== undefined) data.email      = input.email
  if (input.role       !== undefined) data.role       = input.role
  if (input.idVendProt !== undefined) data.idVendProt = input.idVendProt ?? null
  if (input.password) data.password = await bcrypt.hash(input.password, 12)

  // Invalida todas as sessões ativas ao trocar role ou senha
  const sensitiveChange = input.role !== undefined || !!input.password
  if (sensitiveChange) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
  }

  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true, idVendProt: true, createdAt: true },
  })
}

// ─── Customers (CRUD por empresa) ────────────────────────────────────────────

export interface CreateCustomerInput {
  name:         string
  protheusCode?: string
  loja?:         string
  document?:     string
  email?:        string
  phone?:        string
  address?:      string
  municipio?:    string
  bairro?:       string
  cep?:          string
  uf?:           string
}

export async function createCustomer(companyId: string, input: CreateCustomerInput) {
  return prisma.customer.create({ data: { ...input, companyId } })
}

export interface UpdateCustomerInput extends Partial<CreateCustomerInput> {}

export async function updateCustomer(companyId: string, id: string, input: UpdateCustomerInput) {
  const exists = await prisma.customer.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Cliente não encontrado')
  const data: Record<string, unknown> = {}
  const fields: (keyof CreateCustomerInput)[] = [
    'name', 'protheusCode', 'loja', 'document', 'email', 'phone', 'address',
    'municipio', 'bairro', 'cep', 'uf', 'vendorCode',
    'msblql', 'transpPadrao', 'condPagPadrao', 'tes', 'xcodemp',
  ]
  for (const f of fields) {
    if (input[f] !== undefined) data[f] = input[f] || null
  }
  if (input.name !== undefined) data.name = input.name
  return prisma.customer.update({ where: { id }, data })
}

export async function toggleCustomerActive(companyId: string, id: string, active: boolean) {
  const exists = await prisma.customer.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Cliente não encontrado')
  return prisma.customer.update({ where: { id }, data: { active } })
}

// ─── Products (CRUD por empresa) ─────────────────────────────────────────────

export interface CreateProductInput {
  name:          string
  protheusCode?: string
  description?:  string
  price:         number
  unit?:         string
  stock?:        number
  saldo?:        number
}

export async function createProduct(companyId: string, input: CreateProductInput) {
  return prisma.product.create({
    data: {
      companyId,
      name:         input.name,
      protheusCode: input.protheusCode || null,
      description:  input.description  || null,
      price:        input.price,
      unit:         input.unit  ?? 'UN',
      stock:        input.stock ?? 0,
      saldo:        input.saldo ?? 0,
    },
  })
}

export interface UpdateProductInput extends Partial<CreateProductInput> {}

export async function updateProduct(companyId: string, id: string, input: UpdateProductInput) {
  const exists = await prisma.product.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Produto não encontrado')
  const data: Record<string, unknown> = {}
  if (input.name         !== undefined) data.name         = input.name
  if (input.protheusCode !== undefined) data.protheusCode = input.protheusCode || null
  if (input.description  !== undefined) data.description  = input.description  || null
  if (input.price        !== undefined) data.price        = input.price
  if (input.unit         !== undefined) data.unit         = input.unit
  if (input.stock        !== undefined) data.stock        = input.stock
  if (input.saldo        !== undefined) data.saldo        = input.saldo
  return prisma.product.update({ where: { id }, data })
}

export async function toggleProductActive(companyId: string, id: string, active: boolean) {
  const exists = await prisma.product.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Produto não encontrado')
  return prisma.product.update({ where: { id }, data: { active } })
}

// ─── Orders (cancelar) ───────────────────────────────────────────────────────

export async function cancelOrder(companyId: string, id: string) {
  const exists = await prisma.order.findFirst({ where: { id, companyId } })
  if (!exists) throw new Error('Pedido não encontrado')
  return prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } })
}

// ─── Helper interno para o módulo de sync ────────────────────────────────────
// Retorna credenciais descriptografadas — nunca expor via API

export async function getCompanyCredentialsForSync(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })

  return {
    ...company,
    passProtheus: company.passProtheus ? decryptCredential(company.passProtheus) : null,
  }
}

// ─── Protheus Logs ───────────────────────────────────────────────────────────

export interface ListProtheusLogsOpts {
  page:       number
  limit:      number
  operation?: string
  success?:   boolean
  from?:      Date
  to?:        Date
}

export async function listProtheusLogs(companyId: string, opts: ListProtheusLogsOpts) {
  const { page, limit, operation, success, from, to } = opts
  const skip = (page - 1) * limit

  const where = {
    companyId,
    ...(operation !== undefined ? { operation } : {}),
    ...(success   !== undefined ? { success }   : {}),
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to   ? { lte: to   } : {}),
      },
    } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.protheusLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.protheusLog.count({ where }),
  ])

  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit),
  }
}
