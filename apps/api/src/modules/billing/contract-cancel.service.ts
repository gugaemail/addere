import { prisma } from '@addere/db'
import { captureError } from '../../lib/sentry'
import { conflict, notFound } from '../../lib/errors'
import { isTransientDbError } from '../intelligence/jobs/scheduler'
import { clearSchedule } from '../sync/scheduler'
import { recordBillingEvent } from './billing-events'
import { competenceAt, competenceEnd, dateToIsoDay, todaySaoPaulo } from './competence'
import { cancelSentDocuments } from './contract-documents.service'

// Cancelamento do contrato (plano 016, §3.9 do contrato): sem fidelidade e sem
// multa, com efeito no fim do mês do pedido, que é cobrado. O contrato segue
// ACTIVE até endsAt (o gerador cobra esse mês) e o agendador o passa a
// CANCELLED no dia seguinte, em São Paulo.

export const CANCEL_REASON_CONTRACT_ENDING = 'Cancelamento do contrato agendado'
export const CANCEL_REASON_CONTRACT_ENDED = 'Contrato encerrado'

const NOT_ACTIVE_MESSAGE = 'Só um contrato ativo pode ser cancelado.'
const ALREADY_SCHEDULED_MESSAGE = 'O cancelamento deste contrato já está agendado.'
const NOT_SCHEDULED_MESSAGE =
  'Não há cancelamento agendado para desfazer: o contrato não está ativo com término a partir de hoje.'

const SCHEDULE_FIELDS = ['endsAt', 'cancelReason', 'deactivateCompanyOnEnd']

export interface CancelActor {
  id: string
}

/**
 * Agenda o fim do contrato para o último dia do mês corrente em São Paulo
 * (decisão 6: esse mês é cobrado). Cancela os documentos SENT da empresa: um
 * aditivo pendente de um contrato que vai terminar não faz sentido, e um aceite
 * tardio não pode mudar nada.
 */
export async function scheduleContractCancel(
  companyId: string,
  input: { reason: string; deactivateCompany: boolean },
  actor: CancelActor,
  now: Date
): Promise<{ endsAt: string }> {
  const contract = await prisma.companyContract.findUnique({
    where: { companyId },
    select: { id: true, status: true, endsAt: true },
  })
  if (!contract) throw notFound('Contrato não encontrado')
  if (contract.status !== 'ACTIVE') throw conflict(NOT_ACTIVE_MESSAGE, 'CONTRACT_NOT_ACTIVE')
  if (contract.endsAt)
    throw conflict(ALREADY_SCHEDULED_MESSAGE, 'CONTRACT_CANCEL_ALREADY_SCHEDULED')

  const endsAt = competenceEnd(competenceAt(now))

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.companyContract.updateMany({
      where: { id: contract.id, status: 'ACTIVE', endsAt: null },
      data: {
        endsAt,
        cancelRequestedAt: now,
        cancelRequestedById: actor.id,
        cancelReason: input.reason,
        deactivateCompanyOnEnd: input.deactivateCompany,
      },
    })
    // Corrida: outro superadmin agendou (ou o contrato mudou) no meio
    if (count === 0) {
      throw conflict(ALREADY_SCHEDULED_MESSAGE, 'CONTRACT_CANCEL_ALREADY_SCHEDULED')
    }
    await cancelSentDocuments(tx, contract.id, actor.id, CANCEL_REASON_CONTRACT_ENDING)
    await recordBillingEvent(tx, {
      type: 'CONTRACT_CANCEL_SCHEDULED',
      companyId,
      actorId: actor.id,
      fields: SCHEDULE_FIELDS,
    })
  })

  return { endsAt: dateToIsoDay(endsAt) }
}

/**
 * Desfaz o cancelamento agendado (D8), até o último dia do mês: contrato
 * ACTIVE com endsAt >= hoje em São Paulo. Os documentos cancelados no
 * agendamento não voltam: um aditivo precisa ser enviado de novo.
 */
export async function revertContractCancel(
  companyId: string,
  actor: CancelActor,
  now: Date
): Promise<{ reverted: true }> {
  const today = todaySaoPaulo(now)
  const contract = await prisma.companyContract.findUnique({
    where: { companyId },
    select: { id: true, status: true, endsAt: true },
  })
  if (!contract) throw notFound('Contrato não encontrado')
  if (contract.status !== 'ACTIVE' || !contract.endsAt || contract.endsAt < today) {
    throw conflict(NOT_SCHEDULED_MESSAGE, 'CONTRACT_CANCEL_NOT_SCHEDULED')
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.companyContract.updateMany({
      // endsAt >= hoje na própria escrita: não desfaz o que o agendador já encerrou
      where: { id: contract.id, status: 'ACTIVE', endsAt: { gte: today } },
      data: {
        endsAt: null,
        cancelRequestedAt: null,
        cancelRequestedById: null,
        cancelReason: null,
        deactivateCompanyOnEnd: false,
      },
    })
    if (count === 0) throw conflict(NOT_SCHEDULED_MESSAGE, 'CONTRACT_CANCEL_NOT_SCHEDULED')
    await recordBillingEvent(tx, {
      type: 'CONTRACT_CANCEL_REVERTED',
      companyId,
      actorId: actor.id,
      fields: SCHEDULE_FIELDS,
    })
  })

  return { reverted: true }
}

/**
 * Encerra os contratos cujo último dia já passou em São Paulo (D6): status
 * CANCELLED, Inteligência desligada (é o contrato que a liga desde o 014),
 * documentos SENT cancelados e, com a opção marcada, a empresa desativada,
 * tudo na mesma transação. Devolve quantos encerrou. Chamado pelo agendador.
 */
export async function closeEndedContracts(now: Date = new Date()): Promise<number> {
  const today = todaySaoPaulo(now)
  const due = await prisma.companyContract.findMany({
    where: { status: 'ACTIVE', endsAt: { lt: today } },
    select: { id: true, companyId: true, deactivateCompanyOnEnd: true },
  })

  let closed = 0
  for (const contract of due) {
    try {
      const ended = await prisma.$transaction(async (tx) => {
        const { count } = await tx.companyContract.updateMany({
          where: { id: contract.id, status: 'ACTIVE', endsAt: { lt: today } },
          data: { status: 'CANCELLED' },
        })
        // Outro processo já encerrou
        if (count === 0) return false

        await tx.company.update({
          where: { id: contract.companyId },
          data: contract.deactivateCompanyOnEnd
            ? { intelligenceEnabled: false, active: false }
            : { intelligenceEnabled: false },
        })
        // Defensivo: o agendamento já cancelou os documentos SENT
        await cancelSentDocuments(tx, contract.id, null, CANCEL_REASON_CONTRACT_ENDED)
        await recordBillingEvent(tx, {
          type: 'CONTRACT_ENDED',
          companyId: contract.companyId,
          actorId: null,
          fields: contract.deactivateCompanyOnEnd
            ? ['status', 'intelligenceEnabled', 'active']
            : ['status', 'intelligenceEnabled'],
        })
        return true
      })
      if (!ended) continue
      closed++
      // Como o toggleCompanyActive (companies.service.ts): empresa desativada
      // para o auto-sync. A escrita do `active` ficou na transação acima.
      if (contract.deactivateCompanyOnEnd) clearSchedule(contract.companyId)
    } catch (err) {
      // Banco fora: a hora seguinte tenta de novo (o agendador só loga)
      if (isTransientDbError(err)) throw err
      captureError(err, { module: 'billing', op: 'close-contract', companyId: contract.companyId })
    }
  }
  return closed
}
