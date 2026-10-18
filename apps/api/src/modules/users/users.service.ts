import { prisma } from '@addere/db'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { JwtPayload } from '@addere/types'
import { conflict, forbidden, notFound } from '../../lib/errors'
import type { CreateUserInput, UpdateUserInput } from './users.schema'
import {
  applyDefaultPermissions,
  copyUserPermissions,
  grantPermissions,
  revokePermissions,
} from '../permissions/permissions.service'
import { updateUser as updateCompanyUser } from '../companies/companies.service'
import { writeWithSeatGuard } from '../billing/seat-guard'

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

// Permissões do pedido no app que o administrador da empresa liga e desliga no
// formulário do usuário (o modal de Permissões é só do SUPERADMIN). Sem elas, o
// pedido sai com a transportadora e a condição padrão do cliente no Protheus.
const ORDER_PERMISSIONS = {
  canChangeCarrier: 'orders.change_carrier',
  canChangePaymentTerms: 'orders.change_payment_terms',
} as const

type OrderPermissionFlags = { [K in keyof typeof ORDER_PERMISSIONS]?: boolean }
const ORDER_FLAGS = Object.keys(ORDER_PERMISSIONS) as (keyof typeof ORDER_PERMISSIONS)[]
const ORDER_KEYS: string[] = Object.values(ORDER_PERMISSIONS)

// Todo erro de regra daqui é AppError, com o status de sempre: as rotas não
// repassam mais a mensagem de erro que não seja AppError (era assim que a
// mensagem crua do Prisma, com o caminho do arquivo, chegava ao painel).
const EMAIL_TAKEN_MESSAGE = 'Email já cadastrado'

/** P2002 no e-mail: duas criações com o mesmo e-mail ao mesmo tempo */
function isEmailTaken(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false
  const target = err.meta?.target
  return Array.isArray(target) ? target.includes('email') : String(target ?? '').includes('email')
}

// true concede, false revoga, ausente não mexe
async function applyOrderPermissions(userId: string, flags: OrderPermissionFlags) {
  const grant = ORDER_FLAGS.filter((f) => flags[f] === true).map((f) => ORDER_PERMISSIONS[f])
  const revoke = ORDER_FLAGS.filter((f) => flags[f] === false).map((f) => ORDER_PERMISSIONS[f])

  // Sem a linha no catálogo a concessão não grava nada, e o vendedor seguiria
  // travado com a caixa marcada na tela
  if ((await grantPermissions(userId, grant)) < grant.length) {
    throw conflict('Permissão de pedido não cadastrada no sistema. Fale com o suporte da Addere.')
  }
  await revokePermissions(userId, revoke)
}

function orderFlagsFrom(keys: Set<string> | undefined): Required<OrderPermissionFlags> {
  return {
    canChangeCarrier: !!keys?.has(ORDER_PERMISSIONS.canChangeCarrier),
    canChangePaymentTerms: !!keys?.has(ORDER_PERMISSIONS.canChangePaymentTerms),
  }
}

/** Quais das `keys` cada usuário tem, numa consulta só. */
async function permissionKeysByUser(userIds: string[], keys: string[]) {
  const rows = await prisma.userPermission.findMany({
    where: { userId: { in: userIds }, permission: { key: { in: keys } } },
    select: { userId: true, permission: { select: { key: true } } },
  })
  const byUser = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = byUser.get(row.userId) ?? new Set<string>()
    set.add(row.permission.key)
    byUser.set(row.userId, set)
  }
  return byUser
}

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
  // tela, já que o enum Role não tem esse valor — e as permissões do pedido,
  // que o formulário de edição mostra marcadas ou não.
  const keysByUser = await permissionKeysByUser(
    users.map((u) => u.id),
    ['intel.manager', ...ORDER_KEYS]
  )

  return users.map(({ company, ...user }) => {
    const keys = keysByUser.get(user.id)
    return {
      ...user,
      companyName: company?.name ?? null,
      intelManager: !!keys?.has('intel.manager'),
      ...orderFlagsFrom(keys),
    }
  })
}

export async function createUser(input: CreateUserInput, requester: JwtPayload) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw conflict(EMAIL_TAKEN_MESSAGE)

  const hashedPassword = await bcrypt.hash(input.password, 10)

  // Usuário criado por ADMIN nasce vinculado à empresa do criador;
  // SUPERADMIN pode indicar a empresa (ou criar usuário global sem empresa)
  const companyId =
    requester.role === 'SUPERADMIN' ? (input.companyId ?? null) : requester.companyId

  // Vendedor e gerente ocupam licença: a criação passa pela trava (plano 015).
  // A checagem do e-mail acima fica fora da transação: duas criações ao mesmo
  // tempo passam por ela, e a segunda esbarra no @unique (P2002)
  const user = await writeWithSeatGuard(null, { role: input.role, active: true, companyId }, (db) =>
    db.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        companyId,
      },
      select: userSelect,
    })
  ).catch((err: unknown) => {
    if (isEmailTaken(err)) throw conflict(EMAIL_TAKEN_MESSAGE)
    throw err
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

  // As caixas do pedido vêm por cima do padrão do perfil (ou da cópia)
  await applyOrderPermissions(user.id, input)
  const orderKeys = (await permissionKeysByUser([user.id], ORDER_KEYS)).get(user.id)

  return { ...user, intelManager: !!input.intelManager, ...orderFlagsFrom(orderKeys) }
}

export async function toggleUserActive(id: string, requester: JwtPayload) {
  const where = requester.role === 'SUPERADMIN' ? { id } : { id, companyId: requester.companyId }
  const user = await prisma.user.findFirst({ where })
  if (!user) throw notFound('Usuário não encontrado')

  // Ao desativar, invalida todas as sessões ativas
  if (user.active) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
  }

  // Reativar vendedor ou gerente ocupa licença; desativar nunca passa pela trava
  return writeWithSeatGuard(user, { ...user, active: !user.active }, (db) =>
    db.user.update({
      where: { id },
      data: { active: !user.active },
      select: userSelect,
    })
  )
}

/**
 * Atualiza um usuário no escopo global (/users). A regra de negócio — validar
 * o gerente, os campos de vendedor, invalidar sessão ao trocar role ou senha —
 * já existe em companies.service:updateUser; aqui só resolvemos a empresa do
 * usuário e delegamos, em vez de manter duas versões que divergem.
 */
export async function updateUserById(id: string, input: UpdateUserInput, requester: JwtPayload) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { companyId: true, role: true, active: true },
  })
  if (!target) throw notFound('Usuário não encontrado')

  // Usuário sem empresa só o SUPERADMIN alcança (é o caso do próprio SUPERADMIN)
  if (requester.role !== 'SUPERADMIN' && target.companyId !== requester.companyId) {
    throw forbidden('Não é permitido editar usuários de outra empresa')
  }
  const { intelManager, companyId, canChangeCarrier, canChangePaymentTerms, ...profile } = input

  // Vincular empresa é conserto de cadastro órfão, não mudança de lotação:
  // mover alguém de empresa arrastaria junto pedidos, gerente e código de
  // vendedor, que são todos por empresa. Por isso só preenche o vazio.
  let scopeId = target.companyId
  if (companyId !== undefined && companyId !== target.companyId) {
    // 404, o status de sempre desta recusa
    if (target.companyId) throw notFound('Não é possível mover o usuário para outra empresa')
    // Quem não é SUPERADMIN já parou na checagem de empresa acima: um órfão
    // (companyId null) nunca casa com a empresa de um ADMIN.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    })
    if (!company) throw notFound('Empresa não encontrada')
    // Vincular vendedor ou gerente ativo ocupa licença na empresa. Vale o papel
    // final: o órfão que vira ADMIN nesta mesma requisição não precisa de uma
    await writeWithSeatGuard(
      target,
      { role: input.role ?? target.role, active: target.active, companyId },
      (db) => db.user.update({ where: { id }, data: { companyId } })
    )
    scopeId = companyId
  }
  if (!scopeId) {
    throw notFound('Usuário sem empresa: selecione a empresa ativa para vinculá-lo antes de editar')
  }

  // E-mail trocado para um que já existe: P2002, a mesma mensagem da criação
  const user = await updateCompanyUser(scopeId, id, profile).catch((err: unknown) => {
    if (isEmailTaken(err)) throw conflict(EMAIL_TAKEN_MESSAGE)
    throw err
  })

  // O perfil Gerente é a permissão intel.manager: trocar de perfil na tela tem
  // de conceder ou revogar, senão o rótulo e o acesso ficam discordando.
  if (intelManager !== undefined) {
    if (intelManager) await grantPermissions(id, ['intel.manager'])
    else await revokePermissions(id, ['intel.manager'])
  }

  await applyOrderPermissions(id, { canChangeCarrier, canChangePaymentTerms })
  const orderKeys = (await permissionKeysByUser([id], ORDER_KEYS)).get(id)

  return {
    ...user,
    intelManager: intelManager ?? (await hasIntelManager(id)),
    ...orderFlagsFrom(orderKeys),
  }
}

async function hasIntelManager(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, permission: { key: 'intel.manager' } },
    select: { id: true },
  })
  return row !== null
}
