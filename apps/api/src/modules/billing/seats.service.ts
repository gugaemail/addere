import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import {
  resolveCurrentTerms,
  seatLimit,
  type ContractStatus,
  type SeatHolder,
  type SeatUsage,
} from '@addere/types'
import { countSeatHolders } from './seat-guard'

// Leitura das licenças (plano 015): quantas estão em uso, o limite do contrato
// e quem ocupa. A contagem é a mesma da trava (countSeatHolders); o limite sai
// dos termos atuais, como na trava. Sem contrato ACTIVE não há limite.

/** O que os termos precisam ter para resolver os atuais e dar o limite */
export const SEAT_TERMS_SELECT = {
  status: true,
  effectiveFrom: true,
  version: true,
  includedSeats: true,
  extraSeats: true,
} satisfies Prisma.ContractTermsSelect

/** Vendedores e gerentes ativos da empresa, por nome; gerente = intel.manager */
async function listSeatHolders(companyId: string): Promise<SeatHolder[]> {
  const users = await prisma.user.findMany({
    where: { companyId, role: 'SALESPERSON', active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  if (users.length === 0) return []
  const managers = await prisma.userPermission.findMany({
    where: { userId: { in: users.map((u) => u.id) }, permission: { key: 'intel.manager' } },
    select: { userId: true },
  })
  const managerSet = new Set(managers.map((m) => m.userId))
  return users.map((u) => ({ ...u, intelManager: managerSet.has(u.id) }))
}

/**
 * Monta o SeatUsage a partir do status do contrato e dos termos atuais já
 * resolvidos (o GET /billing/me já leu os dois). `current` só conta com
 * contrato ACTIVE.
 */
export async function buildSeatUsage(
  companyId: string,
  contractStatus: ContractStatus | null,
  current: { includedSeats: number; extraSeats: number } | null
): Promise<SeatUsage> {
  const [used, holders] = await Promise.all([
    countSeatHolders(prisma, companyId),
    listSeatHolders(companyId),
  ])
  const limit = contractStatus === 'ACTIVE' && current ? seatLimit(current) : null
  return {
    contractStatus,
    enforced: limit !== null,
    used,
    limit,
    available: limit === null ? null : Math.max(limit - used, 0),
    // Redução de pacote não desativa ninguém (decisão padrão 5): só mostra
    overLimit: limit !== null && used > limit,
    holders,
  }
}

export async function getSeatUsage(companyId: string, now: Date): Promise<SeatUsage> {
  const contract = await prisma.companyContract.findUnique({
    where: { companyId },
    select: { status: true, terms: { where: { status: 'EFFECTIVE' }, select: SEAT_TERMS_SELECT } },
  })
  const current = contract?.status === 'ACTIVE' ? resolveCurrentTerms(contract.terms, now) : null
  return buildSeatUsage(companyId, contract?.status ?? null, current)
}
