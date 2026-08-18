import { prisma } from '@addere/db'
import { notFound } from '../../lib/errors'

export interface CreateBranchInput {
  name: string
  cnpj?: string
  idProtheus?: string
  razaoSocial?: string
  endereco?: string
  complemento?: string
  cidade?: string
  estado?: string
  cep?: string
  logo?: string
}

export interface UpdateBranchInput extends Partial<Omit<CreateBranchInput, 'logo'>> {
  logo?: string | null
}

export async function createBranch(companyId: string, input: CreateBranchInput) {
  return prisma.branch.create({ data: { ...input, companyId } })
}

export async function updateBranch(companyId: string, id: string, input: UpdateBranchInput) {
  const exists = await prisma.branch.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!exists) throw notFound('Filial não encontrada')
  const data: Record<string, unknown> = {}
  if (input.name        !== undefined) data.name        = input.name
  if (input.cnpj        !== undefined) data.cnpj        = input.cnpj        || null
  if (input.idProtheus  !== undefined) data.idProtheus  = input.idProtheus  || null
  if (input.razaoSocial !== undefined) data.razaoSocial = input.razaoSocial || null
  if (input.endereco    !== undefined) data.endereco    = input.endereco    || null
  if (input.complemento !== undefined) data.complemento = input.complemento || null
  if (input.cidade      !== undefined) data.cidade      = input.cidade      || null
  if (input.estado      !== undefined) data.estado      = input.estado      || null
  if (input.cep         !== undefined) data.cep         = input.cep         || null
  if (input.logo        !== undefined) data.logo        = input.logo        ?? null
  return prisma.branch.update({ where: { id }, data })
}

export async function toggleBranchActive(companyId: string, id: string, active: boolean) {
  const exists = await prisma.branch.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!exists) throw notFound('Filial não encontrada')
  return prisma.branch.update({ where: { id }, data: { active } })
}
