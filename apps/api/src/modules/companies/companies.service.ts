import { prisma } from '@addere/db'

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

  return company
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

// ─── Customers (por empresa) ─────────────────────────────────────────────────

export async function listCompanyCustomers(companyId: string) {
  return prisma.customer.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  })
}

// ─── Products (por empresa) ───────────────────────────────────────────────────

export async function listCompanyProducts(companyId: string) {
  return prisma.product.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  })
}

// ─── Orders (por empresa) ─────────────────────────────────────────────────────

export async function listCompanyOrders(companyId: string) {
  return prisma.order.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
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

import bcrypt from 'bcryptjs'

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
