import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { encryptCredential, decryptCredential } from '../../lib/protheus-crypto'

const MAX_PAGE_SIZE = 500

// ─── Companies ────────────────────────────────────────────────────────────────

export async function listCompanies() {
  return prisma.company.findMany({
    orderBy: { name: 'asc' },
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
        select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
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
  return { ...company, passProtheus: company.passProtheus ? '••••••••' : null }
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

export async function toggleBranchActive(id: string, active: boolean) {
  return prisma.branch.update({ where: { id }, data: { active } })
}

// ─── Users (por empresa) ────────────────────────────────────────────────────

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'SALESPERSON'
}

export async function createUser(companyId: string, input: CreateUserInput) {
  const passwordHash = await bcrypt.hash(input.password, 10)
  return prisma.user.create({
    data: { ...input, password: passwordHash, companyId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
}

export async function toggleUserActive(id: string, active: boolean) {
  return prisma.user.update({
    where: { id },
    data: { active },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
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
