import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { resolveCurrentTerms } from '@addere/types'
import { env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { recordBillingEvent } from '../billing-events'

// Inteligência pelo contrato (plano 014, decisão de desenho 3). O tipo de
// licença dos termos atuais liga e desliga a Inteligência da empresa. Roda no
// aceite (na mesma transação) e num ticker horário, que aplica o aditivo com
// "vale a partir de" no futuro quando a data chega. O ticker não cobra nem
// avisa ninguém: o plano 016 o absorve no agendador de cobrança.

/**
 * Com contrato ACTIVE, deixa `intelligenceEnabled` igual ao tipo de licença
 * dos termos atuais e grava INTELLIGENCE_APPLIED quando muda. Sem contrato
 * ACTIVE (teste, piloto, implantação), ou sem termos atuais, não faz nada: o
 * SUPERADMIN continua ligando à mão (decisão 1). Devolve se mudou.
 */
export async function syncIntelligenceWithTerms(
  tx: Prisma.TransactionClient,
  companyId: string,
  now: Date
): Promise<boolean> {
  const contract = await tx.companyContract.findUnique({
    where: { companyId },
    select: {
      status: true,
      terms: {
        where: { status: 'EFFECTIVE' },
        select: { status: true, effectiveFrom: true, version: true, licenseType: true },
      },
    },
  })
  if (!contract || contract.status !== 'ACTIVE') return false
  const current = resolveCurrentTerms(contract.terms, now)
  if (!current) return false

  const expected = current.licenseType === 'INTELLIGENCE'
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { intelligenceEnabled: true },
  })
  if (!company || company.intelligenceEnabled === expected) return false

  await tx.company.update({ where: { id: companyId }, data: { intelligenceEnabled: expected } })
  await recordBillingEvent(tx, {
    type: 'INTELLIGENCE_APPLIED',
    companyId,
    actorId: null,
    fields: ['intelligenceEnabled'],
    ref: { termsVersion: current.version },
  })
  return true
}

/** Uma passada: cada contrato ACTIVE, com o erro de uma empresa isolado das outras */
export async function tickApplyDueTerms(now: Date = new Date()): Promise<number> {
  const contracts = await prisma.companyContract.findMany({
    where: { status: 'ACTIVE' },
    select: { companyId: true },
  })
  let changed = 0
  for (const { companyId } of contracts) {
    try {
      if (await prisma.$transaction((tx) => syncIntelligenceWithTerms(tx, companyId, now))) {
        changed++
      }
    } catch (err) {
      captureError(err, { module: 'apply-due-terms', companyId })
    }
  }
  return changed
}

const TICK_MS = 60 * 60 * 1000
let ticker: ReturnType<typeof setInterval> | null = null

/** No molde do initIntelScheduler: desligado em test, passada no boot (catch-up) e de hora em hora */
export function initApplyDueTermsTicker(): void {
  if (env.NODE_ENV === 'test' || ticker) return
  const run = () =>
    void tickApplyDueTerms().catch((err) => captureError(err, { module: 'apply-due-terms' }))
  run()
  ticker = setInterval(run, TICK_MS)
  ticker.unref()
  console.log('[apply-due-terms] ticker de 1 h iniciado')
}
