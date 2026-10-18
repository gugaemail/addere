import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { consumesSeat, resolveCurrentTerms, seatLimit, type SeatSubject } from '@addere/types'
import { AppError } from '../../lib/errors'
import { lockContractRow } from './contract-lock'

// Trava de licenças (plano 015). Toda escrita que passa a ocupar uma licença
// (criar, ativar, vincular ou mudar alguém para SALESPERSON) roda aqui dentro.
//
// A trava é a da linha do contrato (lockContractRow, contract-lock.ts, onde
// está o porquê): a segunda escrita da mesma empresa espera a primeira e, no
// READ COMMITTED, conta de novo e vê o vendedor que a primeira gravou. Com 19
// de 20, a primeira conta 19 e grava; a segunda conta 20 e recusa.
//
// A ordem é obrigatória: (1) trava, (2) contrato e termos, (3) contagem,
// (4) escrita, tudo com o mesmo tx. Contar antes da trava, ou escrever com
// `prisma` em vez de `tx`, desfaz a garantia. Empresas diferentes não esperam
// umas pelas outras; sem contrato não há linha para prender, nem limite.
// bcrypt, e-mail e Protheus ficam fora da transação: a trava dura milissegundos.

type Db = Prisma.TransactionClient

/** Fonte única de "quem ocupa licença": vendedor ou gerente ativo da empresa. */
export function countSeatHolders(db: Db, companyId: string): Promise<number> {
  return db.user.count({ where: { companyId, role: 'SALESPERSON', active: true } })
}

export async function withSeat<T>(companyId: string, write: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // 1. Trava: o UPDATE prende a linha do contrato até o fim da transação
    const hasContract = await lockContractRow(tx, companyId)
    // Sem contrato: implantação, teste ou piloto — sem limite (decisão padrão 1)
    if (!hasContract) return write(tx)

    // 2. Contrato e termos, lidos depois da trava
    const contract = await tx.companyContract.findUnique({
      where: { companyId },
      select: { id: true, status: true },
    })
    if (!contract) throw new Error(`Contrato da empresa ${companyId} sumiu dentro da trava`)
    if (contract.status === 'CANCELLED') {
      throw new AppError(
        409,
        'O contrato desta empresa foi cancelado: não é possível criar nem ativar vendedores ou gerentes.',
        undefined,
        'CONTRACT_CANCELLED'
      )
    }
    // DRAFT e PENDING_ACCEPTANCE: antes do aceite nada começa
    if (contract.status !== 'ACTIVE') return write(tx)

    const effective = await tx.contractTerms.findMany({
      where: { contractId: contract.id, status: 'EFFECTIVE' },
      select: {
        status: true,
        effectiveFrom: true,
        version: true,
        includedSeats: true,
        extraSeats: true,
      },
    })
    const current = resolveCurrentTerms(effective, new Date())
    // Invariante quebrada (o aceite do 014 cria os termos na mesma transação):
    // vira 500 e vai para o Sentry, nunca "sem limite"
    if (!current) throw new Error(`Contrato ${contract.id} ACTIVE sem termos vigentes`)

    // 3. Contagem, depois da trava
    const limit = seatLimit(current)
    const used = await countSeatHolders(tx, companyId)
    if (used >= limit) {
      throw new AppError(
        409,
        `Limite de licenças atingido: ${used} de ${limit} em uso. Desative um vendedor ou gerente, ou peça mais licenças em Plano e cobrança.`,
        { used, limit },
        'SEAT_LIMIT_REACHED'
      )
    }
    // 4. A escrita, com o mesmo tx
    return write(tx)
  })
}

/** Só entra na trava a escrita que passa a ocupar uma licença. */
export function writeWithSeatGuard<T>(
  before: SeatSubject | null,
  after: SeatSubject,
  write: (db: Db) => Promise<T>
): Promise<T> {
  return after.companyId && consumesSeat(before, after)
    ? withSeat(after.companyId, write)
    : write(prisma)
}
