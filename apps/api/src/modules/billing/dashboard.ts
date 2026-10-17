import { Prisma } from '@prisma/client'
import type {
  AccessBlockReason,
  ContractDocumentKind,
  ContractDocumentStatus,
  ContractStatus,
  ContractTermsStatus,
  InvoiceStatus,
  LicenseRequestStatus,
} from '@prisma/client'
import {
  CLIENT_STATUS_ORDER,
  DASHBOARD_LIST_LIMIT,
  NEAR_SEAT_LIMIT_PCT,
  UPCOMING_DUE_DAYS,
  deriveClientStatus,
  isBillableNow,
  isInvoiceOverdue,
  resolveCurrentTerms,
  seatLimit,
  type BillingDashboardDto,
  type ClientStatus,
  type DashboardDocumentItem,
  type DashboardInvoiceItem,
  type DashboardLicenseRequestItem,
  type DashboardList,
  type DashboardSeatItem,
  type MoneyTotal,
  type RevenueMonth,
} from '@addere/types'
import { resolveCompanyAccess } from '../../lib/company-access'
import {
  dateToYmdUtc,
  daysOverdueOn,
  diffDays,
  ymdSaoPaulo,
} from '../intelligence/engine/business-days'
import { addMonthsYm, competenceStart, dateToIsoDay, isoToYm, ymToIso } from './competence'

// Painel da Gestão Addere (plano 018) — agregação PURA: recebe as linhas das
// cinco consultas de dashboard.service.ts e o relógio de fora, e devolve o DTO.
// Testada sem banco em __tests__/dashboard.test.ts.
//
// Dinheiro só em Prisma.Decimal (.plus/.times, a partir de zero) e string com
// duas casas na fronteira: nenhuma soma passa por number. Dias como 'YYYYMMDD':
// hoje em São Paulo (ymdSaoPaulo) e @db.Date lido em UTC (dateToYmdUtc). Nenhum
// "-3" fixo.

// ─── Linhas que o serviço entrega ────────────────────────────────────────────

export interface DashboardTermsRow {
  version: number
  status: ContractTermsStatus
  effectiveFrom: Date | null
  includedSeats: number
  extraSeats: number
  packagePrice: Prisma.Decimal
  extraSeatPrice: Prisma.Decimal
}

export interface DashboardCompanyRow {
  id: string
  name: string
  active: boolean
  accessBlockedAt: Date | null
  accessBlockReason: AccessBlockReason | null
  contract: {
    status: ContractStatus
    graceMonths: number
    firstBilledCompetence: Date | null
    terms: DashboardTermsRow[]
  } | null
}

export interface DashboardInvoiceRow {
  id: string
  number: number
  companyId: string
  competence: Date // @db.Date, dia 1
  dueDate: Date // @db.Date
  status: InvoiceStatus
  total: Prisma.Decimal
  paidAt: Date | null // @db.Date: o mês da baixa sai por dateToYmdUtc
  paidAmount: Prisma.Decimal | null
}

export interface DashboardDocumentRow {
  id: string
  companyId: string
  kind: ContractDocumentKind
  status: ContractDocumentStatus
  sentAt: Date
}

export interface DashboardLicenseRequestRow {
  id: string
  companyId: string
  quantity: number
  status: LicenseRequestStatus
  createdAt: Date
}

export interface DashboardSource {
  companies: DashboardCompanyRow[]
  invoices: DashboardInvoiceRow[]
  documents: DashboardDocumentRow[]
  licenseRequests: DashboardLicenseRequestRow[]
  /** Licenças usadas por empresa: SALESPERSON ativo (usedSeatsByCompany) */
  usedSeats: Map<string, number>
}

// ─── Helpers puros ───────────────────────────────────────────────────────────

const REVENUE_MONTHS = 12

/** packagePrice + extraSeats × extraSeatPrice, em Decimal. Cobra o contratado, não o uso. */
export function termsMonthlyValue(terms: {
  packagePrice: Prisma.Decimal
  extraSeats: number
  extraSeatPrice: Prisma.Decimal
}): Prisma.Decimal {
  return new Prisma.Decimal(terms.packagePrice).plus(
    new Prisma.Decimal(terms.extraSeatPrice).times(terms.extraSeats)
  )
}

/** Os `n` meses fechados antes do mês de `today` ('YYYYMMDD'), 'YYYY-MM', do mais antigo ao mais recente. */
export function lastClosedMonths(today: string, n: number): string[] {
  const current = today.slice(0, 6)
  return Array.from({ length: n }, (_, i) => ymToIso(addMonthsYm(current, i - n)))
}

/** @db.Date do dia 1 do mês mais antigo do gráfico: o recorte da consulta de faturas. */
export function revenueWindowStart(today: string): Date {
  return competenceStart(isoToYm(lastClosedMonths(today, REVENUE_MONTHS)[0]))
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
const isoDay = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
/** 'YYYYMM' de um @db.Date → 'YYYY-MM' */
const monthOf = (date: Date) => ymToIso(dateToYmdUtc(date).slice(0, 6))

const zero = () => new Prisma.Decimal(0)

class Total {
  count = 0
  amount = zero()
  add(value: Prisma.Decimal) {
    this.count += 1
    this.amount = this.amount.plus(value)
  }
  toDto(): MoneyTotal {
    return { count: this.count, amount: this.amount.toFixed(2) }
  }
}

function cut<T>(items: T[]): DashboardList<T> {
  return { total: items.length, items: items.slice(0, DASHBOARD_LIST_LIMIT) }
}

const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

// ─── Agregação ───────────────────────────────────────────────────────────────

export function buildBillingDashboard(source: DashboardSource, now: Date): BillingDashboardDto {
  const today = ymdSaoPaulo(now)
  const currentMonth = ymToIso(today.slice(0, 6))
  const names = new Map(source.companies.map((c) => [c.id, c.name]))
  const nameOf = (companyId: string) => names.get(companyId) ?? '—'

  // Faturas CANCELLED não entram em nenhum indicador
  const invoices = source.invoices.filter((i) => i.status !== 'CANCELLED')
  const open = invoices.filter((i) => i.status === 'OPEN')

  // ─── Faturas em aberto: a receber, vencido, vence em 15 dias ───
  const openTotal = new Total()
  const overdueTotal = new Total()
  const upcomingTotal = new Total()
  const overdueRows: Array<{ row: DashboardInvoiceRow; due: string }> = []
  const upcomingRows: Array<{ row: DashboardInvoiceRow; due: string }> = []
  const openDueByCompany = new Map<string, string[]>()

  for (const inv of open) {
    const due = dateToYmdUtc(inv.dueDate)
    const list = openDueByCompany.get(inv.companyId) ?? []
    list.push(due)
    openDueByCompany.set(inv.companyId, list)

    openTotal.add(inv.total)
    if (isInvoiceOverdue(due, today)) {
      overdueTotal.add(inv.total)
      overdueRows.push({ row: inv, due })
    } else {
      const daysAhead = diffDays(today, due)
      if (daysAhead >= 0 && daysAhead <= UPCOMING_DUE_DAYS) {
        upcomingTotal.add(inv.total)
        upcomingRows.push({ row: inv, due })
      }
    }
  }

  const invoiceItem = (inv: DashboardInvoiceRow, daysOverdue: number): DashboardInvoiceItem => ({
    invoiceId: inv.id,
    companyId: inv.companyId,
    companyName: nameOf(inv.companyId),
    number: inv.number,
    competence: monthOf(inv.competence),
    dueDate: dateToIsoDay(inv.dueDate),
    total: inv.total.toFixed(2),
    daysOverdue,
  })
  const byDue = (
    a: { row: DashboardInvoiceRow; due: string },
    b: { row: DashboardInvoiceRow; due: string }
  ) => a.due.localeCompare(b.due) || a.row.number - b.row.number

  // ─── Recebido (no mês da baixa) e faturado (por competência) ───
  const months = lastClosedMonths(today, REVENUE_MONTHS)
  const billedByMonth = new Map(months.map((m) => [m, zero()]))
  const receivedByMonth = new Map(months.map((m) => [m, zero()]))
  const receivedThisMonth = new Total()

  for (const inv of invoices) {
    const competence = monthOf(inv.competence)
    const billed = billedByMonth.get(competence)
    if (billed) billedByMonth.set(competence, billed.plus(inv.total))

    if (inv.status !== 'PAID' || !inv.paidAt) continue
    // paidAt é @db.Date (dia civil informado na baixa): lido em UTC. Pelo
    // ymdSaoPaulo, a baixa do dia 1 (meia-noite UTC) cairia no mês anterior.
    const paidMonth = monthOf(inv.paidAt)
    // Baixa sem valor (não deveria existir: a baixa grava os dois) vale o total
    const paid = inv.paidAmount ?? inv.total
    if (paidMonth === currentMonth) receivedThisMonth.add(paid)
    const received = receivedByMonth.get(paidMonth)
    if (received) receivedByMonth.set(paidMonth, received.plus(paid))
  }

  const revenue12m: RevenueMonth[] = months.map((month) => ({
    month,
    billed: (billedByMonth.get(month) ?? zero()).toFixed(2),
    received: (receivedByMonth.get(month) ?? zero()).toFixed(2),
  }))

  // ─── Empresas: situação, MRR e licenças ───
  const clientsByStatus = Object.fromEntries(CLIENT_STATUS_ORDER.map((s) => [s, 0])) as Record<
    ClientStatus,
    number
  >
  let contracted = zero()
  let billable = zero()
  let activeContracts = 0
  let graceContracts = 0
  let seatsUsed = 0
  let seatsLimit = 0
  const near: DashboardSeatItem[] = []

  for (const company of source.companies) {
    const status = deriveClientStatus({
      contract: company.contract,
      today,
      openInvoiceDueDates: openDueByCompany.get(company.id) ?? [],
      accessBlockReason: resolveCompanyAccess(company).reason,
    })
    clientsByStatus[status] += 1

    // Antes do aceite nada começa; cancelado sai do MRR (a última fatura fica)
    const contract = company.contract
    if (contract?.status !== 'ACTIVE') continue
    activeContracts += 1

    // Termos atuais: a regra do 013, escolhida em memória (nunca orderBy + take)
    const terms = resolveCurrentTerms(contract.terms, now)
    const monthly = terms ? termsMonthlyValue(terms) : zero()
    contracted = contracted.plus(monthly)
    if (isBillableNow(contract, today)) billable = billable.plus(monthly)
    else graceContracts += 1

    if (!terms) continue
    const used = source.usedSeats.get(company.id) ?? 0
    const limit = seatLimit(terms) // o Ilimitado entra pela quantidade digitada
    seatsUsed += used
    seatsLimit += limit
    // Conta inteira, sem float: used/limit ≥ 90 %
    if (used * 100 >= limit * NEAR_SEAT_LIMIT_PCT) {
      near.push({ companyId: company.id, companyName: company.name, used, limit })
    }
  }

  // Maior ocupação primeiro, por produto cruzado (acima do limite fica no topo,
  // decisão 5); empate pelo nome
  near.sort((a, b) => b.used * a.limit - a.used * b.limit || byName(a.companyName, b.companyName))

  // ─── Aguardando aceite e solicitações ───
  const pendingAcceptance: DashboardDocumentItem[] = source.documents
    .filter((d) => d.status === 'SENT')
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
    .map((d) => ({
      documentId: d.id,
      companyId: d.companyId,
      companyName: nameOf(d.companyId),
      kind: d.kind,
      sentAt: d.sentAt.toISOString(),
      daysWaiting: diffDays(ymdSaoPaulo(d.sentAt), today),
    }))

  const pendingLicenseRequests: DashboardLicenseRequestItem[] = source.licenseRequests
    .filter((r) => r.status === 'PENDING')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({
      requestId: r.id,
      companyId: r.companyId,
      companyName: nameOf(r.companyId),
      quantity: r.quantity,
      createdAt: r.createdAt.toISOString(),
    }))

  return {
    generatedAt: now.toISOString(),
    today: isoDay(today),
    mrr: {
      contracted: contracted.toFixed(2),
      billable: billable.toFixed(2),
      activeContracts,
      graceContracts,
    },
    clientsByStatus,
    seats: { used: seatsUsed, limit: seatsLimit },
    receivable: {
      open: openTotal.toDto(),
      overdue: overdueTotal.toDto(),
      dueNext15Days: upcomingTotal.toDto(),
      receivedThisMonth: receivedThisMonth.toDto(),
    },
    overdueInvoices: cut(
      overdueRows.sort(byDue).map(({ row }) => invoiceItem(row, daysOverdueOn(row.dueDate, today)))
    ),
    upcomingInvoices: cut(upcomingRows.sort(byDue).map(({ row }) => invoiceItem(row, 0))),
    pendingAcceptance: cut(pendingAcceptance),
    pendingLicenseRequests: cut(pendingLicenseRequests),
    nearSeatLimit: cut(near),
    revenue12m,
  }
}
