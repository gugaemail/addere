import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import type { JwtPayload } from '@addere/types'
import type { CreateUserInput, UpdateUserInput } from './users.schema'
import {
  applyDefaultPermissions,
  copyUserPermissions,
  grantPermissions,
  revokePermissions,
} from '../permissions/permissions.service'
import { updateUser as updateCompanyUser } from '../companies/companies.service'

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  // A lista global é a tela de cadastro do painel: sem estes campos ela não
  // consegue mostrar de que empresa é cada linha nem editar o vendedor.
  companyId: true,
  idVendProt: true,
  visitsPerDay: true,
  vehicle: true,
  servedCities: true,
  messageTone: true,
  managerId: true,
  company: { select: { name: true } },
} as const

// SUPERADMIN enxerga todos os usuários; demais roles apenas os da própria empresa
export async function listUsers(requester: JwtPayload) {
  const where = requester.role === 'SUPERADMIN' ? {} : { companyId: requester.companyId }
  const users = await prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  // Quem tem intel.manager (D3b) — é o que distingue "Gerente" de "Vendedor" na
  // tela, já que o enum Role não tem esse valor. Mesma consulta de
  // companies.service.ts, aqui sem recorte por empresa.
  const managerHolders = await prisma.userPermission.findMany({
    where: { userId: { in: users.map((u) => u.id) }, permission: { key: 'intel.manager' } },
    select: { userId: true },
  })
  const managerSet = new Set(managerHolders.map((m) => m.userId))

  return users.map(({ company, ...user }) => ({
    ...user,
    companyName: company?.name ?? null,
    intelManager: managerSet.has(user.id),
  }))
}

export async function createUser(input: CreateUserInput, requester: JwtPayload) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('Email já cadastrado')

  const hashedPassword = await bcrypt.hash(input.password, 10)

  // Usuário criado por ADMIN nasce vinculado à empresa do criador;
  // SUPERADMIN pode indicar a empresa (ou criar usuário global sem empresa)
  const companyId =
    requester.role === 'SUPERADMIN' ? (input.companyId ?? null) : requester.companyId

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashedPassword,
      role: input.role,
      companyId,
    },
    select: userSelect,
  })

  // Com origem informada, copia as permissões dela; senão aplica os defaults do role
  // (mesmo catálogo do seed — ADMIN nasce com intel.admin, decisão D3c)
  if (input.copyPermissionsFromUserId) {
    await copyUserPermissions(input.copyPermissionsFromUserId, user.id)
  } else {
    await applyDefaultPermissions(user.id, user.role)
  }

  // O perfil "Gerente" do painel é vendedor + intel.manager: a permissão nunca
  // é default do role (D3c), então vem por cima. Sem isso o gerente teria de
  // ser permissionado numa segunda tela, depois de criado.
  if (input.intelManager) await grantPermissions(user.id, ['intel.manager'])

  return { ...user, intelManager: !!input.intelManager }
}

export async function toggleUserActive(id: string, requester: JwtPayload) {
  const where = requester.role === 'SUPERADMIN' ? { id } : { id, companyId: requester.companyId }
  const user = await prisma.user.findFirst({ where })
  if (!user) throw new Error('Usuário não encontrado')

  // Ao desativar, invalida todas as sessões ativas
  if (user.active) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
  }

  return prisma.user.update({
    where: { id },
    data: { active: !user.active },
    select: userSelect,
  })
}

/**
 * Atualiza um usuário no escopo global (/users). A regra de negócio — validar
 * o gerente, os campos de vendedor, invalidar sessão ao trocar role ou senha —
 * já existe em companies.service:updateUser; aqui só resolvemos a empresa do
 * usuário e delegamos, em vez de manter duas versões que divergem.
 */
export async function updateUserById(id: string, input: UpdateUserInput, requester: JwtPayload) {
  const target = await prisma.user.findUnique({ where: { id }, select: { companyId: true } })
  if (!target) throw new Error('Usuário não encontrado')

  // Usuário sem empresa só o SUPERADMIN alcança (é o caso do próprio SUPERADMIN)
  if (requester.role !== 'SUPERADMIN' && target.companyId !== requester.companyId) {
    throw new ForbiddenError('Não é permitido editar usuários de outra empresa')
  }
  if (!target.companyId) throw new Error('Usuário sem empresa não pode ser editado por aqui')

  const { intelManager, ...profile } = input
  const user = await updateCompanyUser(target.companyId, id, profile)

  // O perfil Gerente é a permissão intel.manager: trocar de perfil na tela tem
  // de conceder ou revogar, senão o rótulo e o acesso ficam discordando.
  if (intelManager !== undefined) {
    if (intelManager) await grantPermissions(id, ['intel.manager'])
    else await revokePermissions(id, ['intel.manager'])
  }

  return { ...user, intelManager: intelManager ?? (await hasIntelManager(id)) }
}

async function hasIntelManager(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, permission: { key: 'intel.manager' } },
    select: { id: true },
  })
  return row !== null
}

export class ForbiddenError extends Error {}
