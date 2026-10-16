import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { resolveCompetenceTerms } from '@addere/types'
import { captureError } from '../../lib/sentry'
import { recordBillingEvent } from './billing-events'
import {
  competenceEnd,
  competenceStart,
  dueDateFor,
  previousCompetenceAt,
  todaySaoPaulo,
  ymToIso,
  type Ym,
} from './competence'
import {
  buildContractItems,
  isCompetenceBillable,
  isP2002,
  sumAmounts,
  type DraftItem,
} from './invoice-rules'

// Faturas (plano 016) — mensal, pós-pago, baixa manual. Três erros de dinheiro
// guiam este arquivo: competência errada por fuso (tudo passa por
// competence.ts), cobrar o que não devia (a consulta e isCompetenceBillable
// conferem a mesma regra duas vezes) e cobrar duas vezes (a chave única
// [companyId, competence] da fatura; nada de tabela de trava).

// ─── Contrato com os termos ──────────────────────────────────────────────────

export const CONTRACT_FOR_BILLING = {
  id: true,
  companyId: true,
  status: true,
  firstBilledCompetence: true,
  endsAt: true,
  dueDay: true,
  terms: {
    where: { status: 'EFFECTIVE' },
    select: {
      id: true,
      status: true,
      effectiveFrom: true,
      version: true,
      licenseType: true,
      includedSeats: true,
      extraSeats: true,
      packagePrice: true,
      extraSeatPrice: true,
      package: { select: { name: true } },
    },
  },
} satisfies Prisma.CompanyContractSelect

export type ContractWithTerms = Prisma.CompanyContractGetPayload<{
  select: typeof CONTRACT_FOR_BILLING
}>

export interface InvoiceDraft {
  termsId: string
  dueDate: Date // @db.Date
  items: DraftItem[]
  total: Prisma.Decimal
}

/**
 * Contratos que PODEM ser cobrados na competência M. É a mesma regra de
 * isCompetenceBillable (invoice-rules.ts), escrita como consulta: quem mexer
 * numa mexe na outra, e os testes conferem as duas.
 *
 * - firstBilledCompetence <= M: o mês do aceite e a carência ficam de fora, e
 *   DRAFT/PENDING_ACCEPTANCE não têm a data (nem estão no OR de status);
 * - ACTIVE sem fim, ou com fim (endsAt) a partir do dia 1 de M;
 * - CANCELLED só no mês em que terminou: os meses anteriores já foram
 *   faturados com o contrato ainda ACTIVE.
 */
export function billableContractsWhere(ym: Ym): Prisma.CompanyContractWhereInput {
  const competence = competenceStart(ym)
  return {
    firstBilledCompetence: { lte: competence },
    OR: [
      { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gte: competence } }] },
      { status: 'CANCELLED', endsAt: { gte: competence, lte: competenceEnd(ym) } },
    ],
  }
}

/**
 * Itens automáticos e vencimento da competência; null se não há termos
 * efetivos. Usado também pelo recálculo e pela fatura avulsa.
 *
 * Termos da competência M (013): o EFFECTIVE de maior effectiveFrom
 * estritamente anterior às 00:00 de São Paulo do dia 1 de M. Mudança que
 * entrou no mês M (aditivo, pedido de licenças) só é cobrada em M+1.
 */
export function buildInvoiceDraft(
  contract: Pick<ContractWithTerms, 'dueDay' | 'terms'>,
  ym: Ym
): InvoiceDraft | null {
  const terms = resolveCompetenceTerms(contract.terms, competenceStart(ym))
  if (!terms) return null
  const items = buildContractItems({
    packageName: terms.package.name,
    licenseType: terms.licenseType,
    includedSeats: terms.includedSeats,
    extraSeats: terms.extraSeats,
    packagePrice: terms.packagePrice,
    extraSeatPrice: terms.extraSeatPrice,
  })
  return {
    termsId: terms.id,
    dueDate: dueDateFor(ym, contract.dueDay),
    items,
    total: sumAmounts(items.map((i) => i.amount)),
  }
}

/** Itens do rascunho no formato do create aninhado */
export function draftItemsData(items: DraftItem[], createdById: string | null) {
  return items.map((i) => ({
    kind: i.kind,
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    amount: i.amount,
    manual: i.manual,
    createdById,
  }))
}

// ─── Gerador ─────────────────────────────────────────────────────────────────

export interface GenerateSummary {
  competence: string // 'YYYY-MM'
  created: number
  existing: number
  skipped: number
  failed: number
}

/**
 * Gera as faturas da competência anterior (D2). Idempotente: pode rodar a cada
 * hora, em dois processos ao mesmo tempo ou junto com um jobs/run manual. Não
 * lança por erro de um contrato; só a consulta inicial pode lançar (o
 * agendador trata).
 */
export async function generateInvoices(now: Date = new Date()): Promise<GenerateSummary> {
  const ym = previousCompetenceAt(now)
  const competence = competenceStart(ym)
  const today = todaySaoPaulo(now)
  const summary: GenerateSummary = {
    competence: ymToIso(ym),
    created: 0,
    existing: 0,
    skipped: 0,
    failed: 0,
  }

  const contracts = await prisma.companyContract.findMany({
    where: billableContractsWhere(ym),
    select: CONTRACT_FOR_BILLING,
  })

  for (const contract of contracts) {
    const context = { module: 'billing', op: 'generate', companyId: contract.companyId, ym }

    // Checagem dupla: a consulta deixou passar o que a regra recusa. É bug, e
    // nunca vira cobrança.
    if (!isCompetenceBillable(contract, ym)) {
      summary.skipped++
      captureError(new Error('Faturamento: contrato fora da regra de cobrança'), context)
      continue
    }

    try {
      // Consultar antes evita gastar um número da sequência a cada hora
      const found = await prisma.invoice.findUnique({
        where: { companyId_competence: { companyId: contract.companyId, competence } },
        select: { id: true },
      })
      if (found) {
        summary.existing++
        continue
      }

      const draft = buildInvoiceDraft(contract, ym)
      if (!draft) {
        // Contrato cobrável sem termos efetivos no início de M: dado inconsistente
        summary.skipped++
        captureError(new Error('Faturamento: contrato sem termos na competência'), context)
        continue
      }

      await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            companyId: contract.companyId,
            competence,
            dueDate: draft.dueDate,
            status: 'OPEN',
            origin: 'JOB',
            termsId: draft.termsId,
            total: draft.total,
            createdById: null,
            items: { create: draftItemsData(draft.items, null) },
          },
          select: { id: true, number: true },
        })
        await recordBillingEvent(tx, {
          type: 'INVOICE_GENERATED',
          companyId: contract.companyId,
          actorId: null,
          fields: [],
          ref: { invoiceId: invoice.id, invoiceNumber: invoice.number },
        })
      })
      summary.created++

      // Geração atrasada (env ligada tarde, servidor fora do ar no dia 1): o
      // superadmin precisa saber, e o 017 conta atraso a partir deste vencimento
      if (draft.dueDate.getTime() < today.getTime()) {
        captureError(new Error('Faturamento: fatura gerada já vencida'), context)
      }
    } catch (err) {
      if (isP2002(err)) {
        // Outro processo criou primeiro
        summary.existing++
        continue
      }
      summary.failed++
      captureError(err, context)
    }
  }

  return summary
}
