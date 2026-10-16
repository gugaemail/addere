import type { Prisma } from '@prisma/client'
import type { DesignatedAdminRef } from '@addere/types'
import { forbidden, unprocessable } from '../../lib/errors'

// Administrador indicado pela Empresa (plano 014, decisão de desenho 10): o
// único que aceita o contrato e os aditivos e, no 015, pede licenças. A regra
// mora aqui para o aceite e o pedido de licenças usarem a mesma função.
//
// Sempre relida no banco: o role do JWT vale por 8 horas (plugins/jwt.ts) e o
// authenticate só relê o `active`, então um indicado rebaixado a vendedor ainda
// carrega role ADMIN no token até ele expirar.

export interface DesigneeUser {
  id: string
  name: string
  email: string
}

interface UserForCheck {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  companyId: string | null
}

const USER_FOR_CHECK = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  companyId: true,
} satisfies Prisma.UserSelect

/** ADMIN ativo da empresa: é o que vale para ser (e continuar) indicado */
export function isValidDesignee(
  user: Omit<UserForCheck, 'email'> | null,
  companyId: string
): boolean {
  return !!user && user.role === 'ADMIN' && user.active && user.companyId === companyId
}

const INVALID_MESSAGE = 'O administrador indicado precisa ser um administrador ativo desta empresa.'
const NOT_DESIGNATED_MESSAGE = 'Só o administrador indicado pela sua empresa pode fazer isso.'

/** Para indicar ou enviar: 422 DESIGNATED_ADMIN_INVALID se não for ADMIN ativo da empresa */
export async function assertValidDesignee(
  db: Prisma.TransactionClient,
  companyId: string,
  userId: string
): Promise<DesigneeUser> {
  const user = await db.user.findUnique({ where: { id: userId }, select: USER_FOR_CHECK })
  if (!user || !isValidDesignee(user, companyId)) {
    throw unprocessable(INVALID_MESSAGE, undefined, 'DESIGNATED_ADMIN_INVALID')
  }
  return { id: user.id, name: user.name, email: user.email }
}

/**
 * Quem chama é o indicado do contrato, e ainda é ADMIN ativo da empresa dele?
 * Senão 403 NOT_DESIGNATED_ADMIN (contrato sem indicado também: ninguém
 * aceita). Devolve nome e e-mail lidos do banco, nunca do JWT.
 */
export async function assertDesignatedAdmin(
  db: Prisma.TransactionClient,
  contract: { companyId: string; designatedAdminId: string | null },
  userId: string
): Promise<DesigneeUser> {
  if (!contract.designatedAdminId || contract.designatedAdminId !== userId) {
    throw forbidden(NOT_DESIGNATED_MESSAGE, 'NOT_DESIGNATED_ADMIN')
  }
  const user = await db.user.findUnique({ where: { id: userId }, select: USER_FOR_CHECK })
  if (!user || !isValidDesignee(user, contract.companyId)) {
    throw forbidden(NOT_DESIGNATED_MESSAGE, 'NOT_DESIGNATED_ADMIN')
  }
  return { id: user.id, name: user.name, email: user.email }
}

/** Select do indicado para montar o DesignatedAdminRef */
export const DESIGNATED_ADMIN_SELECT = {
  id: true,
  name: true,
  role: true,
  active: true,
  companyId: true,
} satisfies Prisma.UserSelect

/** O indicado como o /auth/me e o GET /billing/me devolvem; sem indicado, null */
export function designatedAdminRef(
  contract: {
    companyId: string
    designatedAdmin: Omit<UserForCheck, 'email'> | null
  } | null
): DesignatedAdminRef | null {
  const admin = contract?.designatedAdmin
  if (!contract || !admin) return null
  return { id: admin.id, name: admin.name, valid: isValidDesignee(admin, contract.companyId) }
}
