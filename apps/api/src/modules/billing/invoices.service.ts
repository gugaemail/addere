import { prisma } from '@addere/db'
import { Prisma } from '@prisma/client'
import {
  invoiceDisplayStatus,
  resolveCompetenceTerms,
  type InvoiceDto,
  type InvoiceListResponse,
  type InvoiceStatus,
  type MyInvoiceDto,
} from '@addere/types'
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors'
import { captureError } from '../../lib/sentry'
import { dateToYmdUtc } from '../intelligence/engine/business-days'
import { changedFields, recordBillingEvent } from './billing-events'
import {
  competenceAt,
  competenceEnd,
  competenceStart,
  dateToCompetence,
  dateToIsoDay,
  dueDateFor,
  isoDayToDate,
  isoToYm,
  previousCompetenceAt,
  todaySaoPaulo,
  ymToIso,
  type Ym,
} from './competence'
import {
  buildContractItems,
  isCompetenceBillable,
  isP2002,
  money,
  sumAmounts,
  type DraftItem,
} from './invoice-rules'
import type {
  ListInvoicesQuery,
  ManualInvoiceInput,
  ManualItemInput,
  PayInvoiceInput,
  UpdateInvoiceInput,
} from './invoices.schema'

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

// ─── Leitura ─────────────────────────────────────────────────────────────────

const INVOICE_INCLUDE = {
  company: { select: { name: true } },
  // Automáticos primeiro, depois os manuais na ordem em que foram lançados
  items: { orderBy: [{ manual: 'asc' }, { createdAt: 'asc' }, { kind: 'asc' }] },
} satisfies Prisma.InvoiceInclude

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>

/** Datas de calendário como 'YYYY-MM-DD' e competência como 'YYYY-MM', nunca timestamp */
export function toInvoiceDto(inv: InvoiceRow, today: Date): InvoiceDto {
  return {
    id: inv.id,
    number: inv.number,
    companyId: inv.companyId,
    companyName: inv.company.name,
    competence: ymToIso(dateToCompetence(inv.competence)),
    dueDate: dateToIsoDay(inv.dueDate),
    status: inv.status,
    displayStatus: invoiceDisplayStatus(inv.status, dateToYmdUtc(inv.dueDate), dateToYmdUtc(today)),
    origin: inv.origin,
    total: money(inv.total),
    paidAt: inv.paidAt ? dateToIsoDay(inv.paidAt) : null,
    paidAmount: inv.paidAmount ? money(inv.paidAmount) : null,
    paymentMethod: inv.paymentMethod,
    paymentNote: inv.paymentNote,
    paidByName: inv.paidByName,
    nfNumber: inv.nfNumber,
    notes: inv.notes,
    cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : null,
    cancelledByName: inv.cancelledByName,
    cancelReason: inv.cancelReason,
    items: inv.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      description: i.description,
      quantity: i.quantity,
      unitPrice: money(i.unitPrice),
      amount: money(i.amount),
      manual: i.manual,
    })),
  }
}

/** O que o ADMIN do cliente vê: sem observação interna, motivo e nomes */
export function toMyInvoiceDto(dto: InvoiceDto): MyInvoiceDto {
  return {
    id: dto.id,
    number: dto.number,
    competence: dto.competence,
    dueDate: dto.dueDate,
    displayStatus: dto.displayStatus,
    total: dto.total,
    paidAt: dto.paidAt,
    nfNumber: dto.nfNumber,
    items: dto.items,
  }
}

/**
 * OPEN = em aberto e a vencer (vencimento >= hoje); OVERDUE = em aberto e
 * vencida (vencimento < hoje); hoje em São Paulo. A mesma regra de
 * invoiceDisplayStatus, escrita como consulta.
 */
export async function listInvoices(
  filters: ListInvoicesQuery,
  now: Date
): Promise<InvoiceListResponse> {
  const today = todaySaoPaulo(now)
  const where: Prisma.InvoiceWhereInput = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competence) where.competence = competenceStart(isoToYm(filters.competence))
  if (filters.status === 'OPEN') {
    where.status = 'OPEN'
    where.dueDate = { gte: today }
  } else if (filters.status === 'OVERDUE') {
    where.status = 'OPEN'
    where.dueDate = { lt: today }
  } else if (filters.status) {
    where.status = filters.status
  }

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: [{ dueDate: 'desc' }, { number: 'desc' }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.invoice.count({ where }),
  ])
  return {
    items: rows.map((r) => toInvoiceDto(r, today)),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function getInvoice(id: string, now: Date): Promise<InvoiceDto> {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE })
  if (!inv) throw notFound('Fatura não encontrada')
  return toInvoiceDto(inv, todaySaoPaulo(now))
}

/** GET /billing/me/invoices: todas as faturas da empresa do ADMIN, sem os campos internos */
export async function listMyInvoices(companyId: string, now: Date): Promise<MyInvoiceDto[]> {
  const today = todaySaoPaulo(now)
  const rows = await prisma.invoice.findMany({
    where: { companyId },
    include: INVOICE_INCLUDE,
    orderBy: [{ competence: 'desc' }, { number: 'desc' }],
  })
  return rows.map((r) => toMyInvoiceDto(toInvoiceDto(r, today)))
}

// ─── Mutações ────────────────────────────────────────────────────────────────
// Todas seguem a mesma ordem (passo 8.3 do plano):
// 1. lê a fatura: PAID → INVOICE_PAID_IMMUTABLE (D4), CANCELLED → INVOICE_CANCELLED;
// 2. na transação, começa por updateMany com status OPEN no where. count 0 →
//    alguém mudou no meio: relê e lança o código do status atual. O updateMany
//    também trava a linha até o fim da transação: duas mudanças de itens ao
//    mesmo tempo não se atropelam;
// 3. calcula o total ANTES de gravar: negativo → 422, sem escrever nada;
// 4. grava itens e total; 5. grava o evento, só com nomes de campo.

export interface InvoiceActor {
  id: string
}

const PAID_MESSAGE = 'Fatura paga não muda. Lance um ajuste na próxima fatura.'
const CANCELLED_MESSAGE = 'Fatura cancelada não muda.'
const NEGATIVE_MESSAGE = 'O total da fatura não pode ficar negativo.'

function statusError(status: InvoiceStatus | undefined): AppError {
  if (status === 'PAID') return conflict(PAID_MESSAGE, 'INVOICE_PAID_IMMUTABLE')
  if (status === 'CANCELLED') return conflict(CANCELLED_MESSAGE, 'INVOICE_CANCELLED')
  return notFound('Fatura não encontrada')
}

async function readOpenInvoice(id: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true, companyId: true, competence: true, number: true },
  })
  if (!inv || inv.status !== 'OPEN') throw statusError(inv?.status)
  return inv
}

async function lockOpen(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const { count } = await tx.invoice.updateMany({
    where: { id, status: 'OPEN' },
    data: { updatedAt: new Date() },
  })
  if (count === 0) {
    const current = await tx.invoice.findUnique({ where: { id }, select: { status: true } })
    throw statusError(current?.status)
  }
}

function assertNotNegative(total: Prisma.Decimal): void {
  if (total.isNegative()) {
    throw unprocessable(NEGATIVE_MESSAGE, undefined, 'INVOICE_NEGATIVE_TOTAL')
  }
}

async function actorName(id: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true } })
  return user?.name ?? null
}

/** Item manual: DISCOUNT chega positivo e é gravado negativo; ADJUSTMENT leva o sinal */
export function manualItemData(item: ManualItemInput, createdById: string) {
  const value = new Prisma.Decimal(item.amount)
  const amount = item.kind === 'DISCOUNT' ? value.abs().negated() : value
  return {
    kind: item.kind,
    description: item.description,
    quantity: 1,
    unitPrice: amount,
    amount,
    manual: true,
    createdById,
  }
}

async function invoiceAlreadyExists(companyId: string, competence: Date): Promise<AppError | null> {
  const existing = await prisma.invoice.findUnique({
    where: { companyId_competence: { companyId, competence } },
    select: { id: true, number: true },
  })
  if (!existing) return null
  return new AppError(
    409,
    `Já existe a fatura ${String(existing.number).padStart(6, '0')} nesta competência.`,
    { invoiceId: existing.id, number: existing.number },
    'INVOICE_ALREADY_EXISTS'
  )
}

/** Fatura avulsa (D3): competência passada, sem fatura nela, vencimento >= hoje */
export async function createManualInvoice(
  input: ManualInvoiceInput,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const ym = isoToYm(input.competence)
  if (ym >= competenceAt(now)) {
    throw unprocessable(
      'Fatura avulsa só para um mês anterior ao atual: o mês corrente é faturado no início do mês seguinte.',
      undefined,
      'COMPETENCE_NOT_PAST'
    )
  }
  const dueDate = isoDayToDate(input.dueDate)
  if (!dueDate) throw unprocessable('Vencimento inválido')
  if (dueDate < todaySaoPaulo(now)) {
    throw unprocessable('O vencimento precisa ser hoje ou depois.', undefined, 'DUE_DATE_IN_PAST')
  }

  const competence = competenceStart(ym)
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  })
  if (!company) throw notFound('Cliente não encontrado')

  const existing = await invoiceAlreadyExists(input.companyId, competence)
  if (existing) throw existing

  let termsId: string | null = null
  let autoItems: DraftItem[] = []
  if (input.useContractTerms) {
    const contract = await prisma.companyContract.findUnique({
      where: { companyId: input.companyId },
      select: CONTRACT_FOR_BILLING,
    })
    const draft =
      contract && isCompetenceBillable(contract, ym) ? buildInvoiceDraft(contract, ym) : null
    if (!draft) {
      throw unprocessable(
        'O contrato não cobra esta competência (antes da primeira competência cobrada, depois do encerramento ou sem termos vigentes). Desmarque o pacote do contrato e lance os itens à mão.',
        undefined,
        'COMPETENCE_NOT_BILLABLE'
      )
    }
    termsId = draft.termsId
    autoItems = draft.items
  }

  const manualItems = input.items.map((i) => manualItemData(i, actor.id))
  const total = sumAmounts([...autoItems.map((i) => i.amount), ...manualItems.map((i) => i.amount)])
  assertNotNegative(total)

  let id: string
  try {
    id = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId: input.companyId,
          competence,
          dueDate,
          status: 'OPEN',
          origin: 'MANUAL',
          termsId,
          total,
          notes: input.notes,
          createdById: actor.id,
          items: { create: [...draftItemsData(autoItems, actor.id), ...manualItems] },
        },
        select: { id: true, number: true },
      })
      await recordBillingEvent(tx, {
        type: 'INVOICE_CREATED',
        companyId: input.companyId,
        actorId: actor.id,
        fields: [],
        ref: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      })
      return invoice.id
    })
  } catch (err) {
    // Outra criação (ou o agendador) ocupou a competência no meio: nunca o
    // "Registro duplicado" genérico do handler global
    if (isP2002(err)) {
      throw (
        (await invoiceAlreadyExists(input.companyId, competence)) ??
        conflict('Já existe fatura nesta competência.', 'INVOICE_ALREADY_EXISTS')
      )
    }
    throw err
  }
  return getInvoice(id, now)
}

/**
 * Recalcula pelos termos da competência (o mesmo buildInvoiceDraft do
 * gerador): apaga só os itens automáticos (manual: false), recria, mantém os
 * manuais e refaz o total. Competência que não é mais cobrável fica sem itens
 * automáticos. Não muda o vencimento.
 */
export async function recalculateInvoice(
  id: string,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const inv = await readOpenInvoice(id)
  const ym = dateToCompetence(inv.competence)
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, id)
    const contract = await tx.companyContract.findUnique({
      where: { companyId: inv.companyId },
      select: CONTRACT_FOR_BILLING,
    })
    const draft =
      contract && isCompetenceBillable(contract, ym) ? buildInvoiceDraft(contract, ym) : null
    const autoItems = draft?.items ?? []
    const manual = await tx.invoiceItem.findMany({
      where: { invoiceId: id, manual: true },
      select: { amount: true },
    })
    const total = sumAmounts([...autoItems.map((i) => i.amount), ...manual.map((i) => i.amount)])
    assertNotNegative(total)

    // O filtro manual: false nunca alcança item lançado à mão
    await tx.invoiceItem.deleteMany({ where: { invoiceId: id, manual: false } })
    if (autoItems.length > 0) {
      await tx.invoiceItem.createMany({
        data: draftItemsData(autoItems, actor.id).map((i) => ({ ...i, invoiceId: id })),
      })
    }
    await tx.invoice.update({ where: { id }, data: { total, termsId: draft?.termsId ?? null } })
    await recordBillingEvent(tx, {
      type: 'INVOICE_RECALCULATED',
      companyId: inv.companyId,
      actorId: actor.id,
      fields: ['items', 'total'],
      ref: { invoiceId: id, invoiceNumber: inv.number },
    })
  })
  return getInvoice(id, now)
}

/**
 * Baixa (D5): quita a fatura mesmo com valor diferente do total (juros,
 * arredondamento). O valor recebido fica registrado; a diferença não vira
 * saldo. Grava quem deu a baixa, com o nome congelado.
 */
export async function payInvoice(
  id: string,
  input: PayInvoiceInput,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const inv = await readOpenInvoice(id)
  const paidAt = isoDayToDate(input.paidAt)
  if (!paidAt) throw unprocessable('Data do pagamento inválida')
  if (paidAt > todaySaoPaulo(now)) {
    throw unprocessable('A data do pagamento não pode ser futura.', undefined, 'PAID_AT_IN_FUTURE')
  }
  const paidByName = await actorName(actor.id)

  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, id)
    await tx.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt,
        paidAmount: new Prisma.Decimal(input.amount),
        paymentMethod: input.method,
        paymentNote: input.note,
        paidById: actor.id,
        paidByName,
      },
    })
    await recordBillingEvent(tx, {
      type: 'INVOICE_PAID',
      companyId: inv.companyId,
      actorId: actor.id,
      fields: ['status', 'paidAt', 'paidAmount', 'paymentMethod', 'paymentNote'],
      ref: { invoiceId: id, invoiceNumber: inv.number },
    })
  })

  // Plano 017: o desbloqueio da empresa na baixa entra aqui, depois da transação.

  return getInvoice(id, now)
}

/** Cancelar (D1) quer dizer "este mês não será cobrado": a competência continua ocupada */
export async function cancelInvoice(
  id: string,
  reason: string,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const inv = await readOpenInvoice(id)
  const cancelledByName = await actorName(actor.id)
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, id)
    await tx.invoice.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledById: actor.id,
        cancelledByName,
        cancelReason: reason,
      },
    })
    await recordBillingEvent(tx, {
      type: 'INVOICE_CANCELLED',
      companyId: inv.companyId,
      actorId: actor.id,
      fields: ['status', 'cancelReason'],
      ref: { invoiceId: id, invoiceNumber: inv.number },
    })
  })
  return getInvoice(id, now)
}

/** Desconto ou ajuste manual (sobrevive ao recálculo) */
export async function addInvoiceItem(
  id: string,
  item: ManualItemInput,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const inv = await readOpenInvoice(id)
  const data = manualItemData(item, actor.id)
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, id)
    const current = await tx.invoiceItem.findMany({
      where: { invoiceId: id },
      select: { amount: true },
    })
    const total = sumAmounts([...current.map((i) => i.amount), data.amount])
    assertNotNegative(total)

    const created = await tx.invoiceItem.create({
      data: { ...data, invoiceId: id },
      select: { id: true },
    })
    await tx.invoice.update({ where: { id }, data: { total } })
    await recordBillingEvent(tx, {
      type: 'INVOICE_ITEM_ADDED',
      companyId: inv.companyId,
      actorId: actor.id,
      fields: ['items', 'total'],
      ref: { invoiceId: id, invoiceNumber: inv.number, itemId: created.id },
    })
  })
  return getInvoice(id, now)
}

/** Remove item manual (D9), só com a fatura OPEN */
export async function removeInvoiceItem(
  id: string,
  itemId: string,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const inv = await readOpenInvoice(id)
  await prisma.$transaction(async (tx) => {
    await lockOpen(tx, id)
    const items = await tx.invoiceItem.findMany({
      where: { invoiceId: id },
      select: { id: true, amount: true, manual: true },
    })
    const item = items.find((i) => i.id === itemId)
    if (!item) throw notFound('Item não encontrado nesta fatura')
    if (!item.manual) {
      throw conflict(
        'Só item lançado à mão pode ser removido. Para refazer os itens do contrato, use Recalcular.',
        'INVOICE_ITEM_NOT_MANUAL'
      )
    }
    const total = sumAmounts(items.filter((i) => i.id !== itemId).map((i) => i.amount))
    assertNotNegative(total)

    await tx.invoiceItem.deleteMany({ where: { id: itemId, invoiceId: id, manual: true } })
    await tx.invoice.update({ where: { id }, data: { total } })
    await recordBillingEvent(tx, {
      type: 'INVOICE_ITEM_REMOVED',
      companyId: inv.companyId,
      actorId: actor.id,
      fields: ['items', 'total'],
      ref: { invoiceId: id, invoiceNumber: inv.number, itemId },
    })
  })
  return getInvoice(id, now)
}

/** NF e observação interna (D4): mudam na fatura OPEN e na PAID; valores nunca */
export async function updateInvoice(
  id: string,
  input: UpdateInvoiceInput,
  actor: InvoiceActor,
  now: Date
): Promise<InvoiceDto> {
  const before = await prisma.invoice.findUnique({
    where: { id },
    select: { status: true, companyId: true, number: true, nfNumber: true, notes: true },
  })
  if (!before) throw notFound('Fatura não encontrada')
  if (before.status === 'CANCELLED') throw statusError('CANCELLED')

  const data: { nfNumber?: string | null; notes?: string | null } = {}
  if (input.nfNumber !== undefined) data.nfNumber = input.nfNumber
  if (input.notes !== undefined) data.notes = input.notes
  const fields = changedFields(before, data, Object.keys(data))
  if (fields.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Só NF e observação: o data nunca leva valor, item, status nem baixa
      const { count } = await tx.invoice.updateMany({
        where: { id, status: { in: ['OPEN', 'PAID'] } },
        data,
      })
      if (count === 0) throw statusError('CANCELLED')
      await recordBillingEvent(tx, {
        type: 'INVOICE_UPDATED',
        companyId: before.companyId,
        actorId: actor.id,
        fields,
        ref: { invoiceId: id, invoiceNumber: before.number },
      })
    })
  }
  return getInvoice(id, now)
}
