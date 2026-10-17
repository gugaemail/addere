import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { formatBillingDate, type BillingOverdueStatus, type ClientBlockState } from '@addere/types'
import { resolveCompanyAccess } from '../../lib/company-access'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { captureError } from '../../lib/sentry'
import {
  addDaysYmd,
  dateToYmdUtc,
  ymdSaoPaulo,
  ymdToDate,
} from '../intelligence/engine/business-days'
import { isTransientDbError } from '../intelligence/jobs/scheduler'
import {
  billingRecipients,
  buildAccessReleasedEmail,
  buildSuspensionNoticeEmail,
  buildSuspensionReminderEmail,
  sendBillingEmail,
  sendBillingEmailOnce,
  sendBillingEmailThenRecord,
  type SendOutcome,
} from './billing-mailer'
import { dateToCompetence, dateToIsoDay, todaySaoPaulo, ymToIso } from './competence'
import { money } from './invoice-rules'
import type { ReminderSummary } from './jobs/reminders'
import {
  MAX_EXEMPTION_DAYS,
  computePlannedBlockDate,
  invoiceSustainsBlock,
  noticeDue,
  overdueBlockHolds,
  reminderDue,
  type NoticeOnInvoice,
} from './overdue-block'

// Inadimplência (plano 017): o aviso de suspensão, o lembrete, o bloqueio e a
// liberação. A regra mora em overdue-block.ts (puro); aqui ficam as consultas
// e as escritas.
//
// reconcileCompanyBlock é o ÚNICO lugar do código que grava
// accessBlockReason = 'OVERDUE', e nenhum lugar grava 'MANUAL' (reservado e
// desabilitado desde 15/10/2026).

/** Padrão do BillingSettings.overdueBlockDays (013), se a linha não existir */
export const DEFAULT_OVERDUE_BLOCK_DAYS = 15

export const noticeKey = (invoiceId: string) => `invoice:${invoiceId}:suspension-notice`
export const reminderKey = (invoiceId: string) => `invoice:${invoiceId}:suspension-reminder`

/**
 * Fatura que conta para a inadimplência: em aberto, vencida (vencimento antes
 * de hoje em São Paulo) e com total maior que zero. Fatura zerada (um desconto
 * que cobriu tudo) não gera aviso e, sem aviso, nunca sustenta bloqueio.
 */
export function overdueInvoicesWhere(today: Date): Prisma.InvoiceWhereInput {
  return { status: 'OPEN', total: { gt: 0 }, dueDate: { lt: today } }
}

/** O aviso gravado: enviado no dia do evento (São Paulo), data prevista do payload. */
export function noticeFromEvent(event: {
  createdAt: Date
  payload: Prisma.JsonValue
}): NoticeOnInvoice | null {
  const payload = event.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const planned = (payload as Prisma.JsonObject).plannedBlockYmd
  // Payload sem a data não é aviso válido: sem aviso, sem bloqueio
  if (typeof planned !== 'string' || !/^\d{8}$/.test(planned)) return null
  return { sentYmd: ymdSaoPaulo(event.createdAt), plannedBlockYmd: planned }
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function ymdToIsoDay(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

const emptySummary = (): ReminderSummary => ({ sent: 0, duplicate: 0, skipped: 0, failed: 0 })

async function tally(
  summary: ReminderSummary,
  context: Record<string, unknown>,
  send: () => Promise<SendOutcome>
): Promise<void> {
  try {
    summary[await send()]++
  } catch (err) {
    // Erro de banco: a hora seguinte tenta de novo
    summary.failed++
    captureError(err, context)
  }
}

// ─── Aviso de suspensão ──────────────────────────────────────────────────────

/**
 * Um aviso por fatura vencida (dedupeKey `invoice:<id>:suspension-notice`), a
 * partir do dia seguinte ao vencimento, de empresa ativa. A data prevista é
 * calculada no envio e gravada no evento: mudar overdueBlockDays depois não
 * muda a data já comunicada. O evento só é gravado depois de o Resend aceitar
 * (sendBillingEmailThenRecord): envio que falhou não vira aviso.
 */
export async function sendSuspensionNotices(now: Date = new Date()): Promise<ReminderSummary> {
  const summary = emptySummary()
  const todayYmd = ymdSaoPaulo(now)

  const invoices = await prisma.invoice.findMany({
    where: { ...overdueInvoicesWhere(todaySaoPaulo(now)), company: { active: true } },
    select: {
      id: true,
      number: true,
      status: true,
      companyId: true,
      competence: true,
      dueDate: true,
      total: true,
      company: { select: { name: true, contract: { select: { overdueBlockDays: true } } } },
    },
    orderBy: { dueDate: 'asc' },
  })
  if (invoices.length === 0) return summary

  const noticed = new Set(
    (
      await prisma.billingEvent.findMany({
        where: { dedupeKey: { in: invoices.map((i) => noticeKey(i.id)) } },
        select: { dedupeKey: true },
      })
    ).map((e) => e.dedupeKey)
  )
  const settings = await prisma.billingSettings.findUnique({
    where: { id: 'global' },
    select: { overdueBlockDays: true },
  })
  const defaultDays = settings?.overdueBlockDays ?? DEFAULT_OVERDUE_BLOCK_DAYS

  for (const invoice of invoices) {
    const dedupeKey = noticeKey(invoice.id)
    const dueYmd = dateToYmdUtc(invoice.dueDate)
    const due = noticeDue({
      status: invoice.status,
      dueYmd,
      todayYmd,
      hasNotice: noticed.has(dedupeKey),
    })
    if (!due) continue

    const context = {
      module: 'billing',
      op: 'suspension-notice',
      companyId: invoice.companyId,
      invoiceId: invoice.id,
    }
    await tally(summary, context, async () => {
      const overdueBlockDays = invoice.company.contract?.overdueBlockDays ?? defaultDays
      const plannedBlockYmd = computePlannedBlockDate({
        dueYmd,
        overdueBlockDays,
        sentYmd: todayYmd,
      })
      const to = await billingRecipients(invoice.companyId)
      if (to.length === 0) {
        // Sem ninguém para avisar, a empresa nunca será bloqueada por esta
        // fatura — e alguém precisa saber
        captureError(new Error('Aviso de suspensão sem destinatário'), context)
      }
      const email = buildSuspensionNoticeEmail(
        invoice.company.name,
        {
          number: invoice.number,
          competence: invoice.competence,
          dueDate: invoice.dueDate,
          total: money(invoice.total),
        },
        ymdToDate(plannedBlockYmd)
      )
      return sendBillingEmailThenRecord({
        companyId: invoice.companyId,
        dedupeKey,
        // Reenvio com data recalculada é outro e-mail para o Resend
        idempotencyKey: `${dedupeKey}:${plannedBlockYmd}`,
        eventType: 'SUSPENSION_NOTICE_SENT',
        // Nada de e-mail no payload (LGPD): só a quantidade de destinatários
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          plannedBlockYmd,
          recipients: to.length,
        },
        to,
        ...email,
      })
    })
  }

  return summary
}

// ─── Lembrete ────────────────────────────────────────────────────────────────

/**
 * Um lembrete por aviso (dedupeKey `invoice:<id>:suspension-reminder`), de 1 a
 * 3 dias antes da data prevista, se a fatura continua em aberto e nenhuma
 * liberação cobre a data. Não é condição de bloqueio: usa o envio com reserva
 * do 016.
 */
export async function sendSuspensionReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const summary = emptySummary()
  const todayYmd = ymdSaoPaulo(now)

  const invoices = await prisma.invoice.findMany({
    where: { ...overdueInvoicesWhere(todaySaoPaulo(now)), company: { active: true } },
    select: {
      id: true,
      number: true,
      status: true,
      companyId: true,
      competence: true,
      dueDate: true,
      total: true,
      company: { select: { name: true, blockExemptUntil: true } },
    },
    orderBy: { dueDate: 'asc' },
  })
  if (invoices.length === 0) return summary

  const events = await prisma.billingEvent.findMany({
    where: {
      dedupeKey: { in: invoices.flatMap((i) => [noticeKey(i.id), reminderKey(i.id)]) },
    },
    select: { dedupeKey: true, createdAt: true, payload: true },
  })
  const byKey = new Map(events.map((e) => [e.dedupeKey as string, e]))

  for (const invoice of invoices) {
    const noticeEvent = byKey.get(noticeKey(invoice.id))
    const notice = noticeEvent ? noticeFromEvent(noticeEvent) : null
    if (!notice) continue
    const exempt = invoice.company.blockExemptUntil
    const due = reminderDue({
      status: invoice.status,
      todayYmd,
      plannedBlockYmd: notice.plannedBlockYmd,
      hasReminder: byKey.has(reminderKey(invoice.id)),
      exemptUntilYmd: exempt ? dateToYmdUtc(exempt) : null,
    })
    if (!due) continue

    const context = {
      module: 'billing',
      op: 'suspension-reminder',
      companyId: invoice.companyId,
      invoiceId: invoice.id,
    }
    await tally(summary, context, async () => {
      const email = buildSuspensionReminderEmail(
        invoice.company.name,
        {
          number: invoice.number,
          competence: invoice.competence,
          dueDate: invoice.dueDate,
          total: money(invoice.total),
        },
        ymdToDate(notice.plannedBlockYmd)
      )
      return sendBillingEmailOnce({
        companyId: invoice.companyId,
        dedupeKey: reminderKey(invoice.id),
        eventType: 'SUSPENSION_REMINDER_SENT',
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          plannedBlockYmd: notice.plannedBlockYmd,
        },
        to: await billingRecipients(invoice.companyId),
        ...email,
      })
    })
  }

  return summary
}

// ─── Bloqueio e liberação ────────────────────────────────────────────────────

export interface ReconcileActor {
  userId: string | null // null = agendador
  cause: 'RULE' | 'PAYMENT' | 'INVOICE_CANCELLED'
}

export type ReconcileResult = 'blocked' | 'unblocked' | 'unchanged'

/**
 * Aplica a regra a uma empresa, dentro da transação de quem chama (o tick, a
 * baixa ou o cancelamento de fatura):
 *
 * - a regra se sustenta e a empresa está liberada → bloqueia (OVERDUE);
 * - não se sustenta e o bloqueio é OVERDUE, ou não tem motivo (que vale
 *   OVERDUE) → libera;
 * - bloqueio MANUAL (reservado; só existe se gravado à mão) nunca muda aqui.
 *
 * As duas escritas são updateMany com o estado esperado no where: se outro
 * processo mudou a empresa no meio, count 0 e nada de evento.
 */
export async function reconcileCompanyBlock(
  tx: Prisma.TransactionClient,
  companyId: string,
  now: Date,
  actor: ReconcileActor
): Promise<ReconcileResult> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { accessBlockedAt: true, accessBlockReason: true, blockExemptUntil: true },
  })
  if (!company) return 'unchanged'

  const todayYmd = ymdSaoPaulo(now)
  const settings = await tx.billingSettings.findUnique({
    where: { id: 'global' },
    select: { autoBlockEnabled: true },
  })
  const invoices = await tx.invoice.findMany({
    where: { companyId, ...overdueInvoicesWhere(todaySaoPaulo(now)) },
    select: { id: true, status: true },
  })
  const events =
    invoices.length > 0
      ? await tx.billingEvent.findMany({
          where: { dedupeKey: { in: invoices.map((i) => noticeKey(i.id)) } },
          select: { dedupeKey: true, createdAt: true, payload: true },
        })
      : []
  const noticeByKey = new Map(events.map((e) => [e.dedupeKey as string, noticeFromEvent(e)]))
  const rows = invoices.map((i) => ({
    id: i.id,
    status: i.status as string,
    notice: noticeByKey.get(noticeKey(i.id)) ?? null,
  }))

  const holds = overdueBlockHolds({
    autoBlockEnabled: settings?.autoBlockEnabled === true,
    exemptUntilYmd: company.blockExemptUntil ? dateToYmdUtc(company.blockExemptUntil) : null,
    todayYmd,
    invoices: rows,
  })

  if (holds && !company.accessBlockedAt) {
    const invoiceIds = rows.filter((r) => invoiceSustainsBlock(r, todayYmd)).map((r) => r.id)
    // O filtro de relação confere, na mesma instrução, que a fatura continua em aberto
    const { count } = await tx.company.updateMany({
      where: {
        id: companyId,
        accessBlockedAt: null,
        invoices: { some: { id: { in: invoiceIds }, status: 'OPEN' } },
      },
      data: { accessBlockedAt: now, accessBlockReason: 'OVERDUE' },
    })
    if (count !== 1) return 'unchanged'
    await tx.billingEvent.create({
      data: {
        type: 'ACCESS_BLOCKED',
        companyId,
        actorId: actor.userId,
        payload: { reason: 'OVERDUE', invoiceIds },
      },
    })
    return 'blocked'
  }

  const blockedForOverdue =
    company.accessBlockedAt !== null &&
    (company.accessBlockReason === 'OVERDUE' || company.accessBlockReason === null)
  if (!holds && blockedForOverdue) {
    const { count } = await tx.company.updateMany({
      // OR explícito: `accessBlockReason: { not: 'MANUAL' }` não pegaria o
      // nulo, porque o <> do SQL descarta NULL
      where: {
        id: companyId,
        accessBlockedAt: { not: null },
        OR: [{ accessBlockReason: 'OVERDUE' }, { accessBlockReason: null }],
      },
      data: { accessBlockedAt: null, accessBlockReason: null },
    })
    if (count !== 1) return 'unchanged'
    await tx.billingEvent.create({
      data: {
        type: 'ACCESS_UNBLOCKED',
        companyId,
        actorId: actor.userId,
        payload: { cause: actor.cause, previousReason: 'OVERDUE' },
      },
    })
    return 'unblocked'
  }

  return 'unchanged'
}

export interface ReconcileSummary {
  blocked: number
  unblocked: number
  unchanged: number
  failed: number
}

/**
 * O passo do agendador: toda empresa com bloqueio por atraso (ou sem motivo)
 * ou com fatura vencida, uma transação por empresa. Uma que falha não impede
 * as outras.
 */
export async function reconcileOverdueBlocks(now: Date = new Date()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { blocked: 0, unblocked: 0, unchanged: 0, failed: 0 }
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        {
          accessBlockedAt: { not: null },
          OR: [{ accessBlockReason: 'OVERDUE' }, { accessBlockReason: null }],
        },
        { invoices: { some: overdueInvoicesWhere(todaySaoPaulo(now)) } },
      ],
    },
    select: { id: true },
  })

  for (const { id } of companies) {
    try {
      const result = await prisma.$transaction((tx) =>
        reconcileCompanyBlock(tx, id, now, { userId: null, cause: 'RULE' })
      )
      summary[result]++
    } catch (err) {
      summary.failed++
      if (isTransientDbError(err)) {
        console.warn(
          '[billing] banco indisponível ao reconciliar o bloqueio; tenta na próxima hora'
        )
      } else {
        captureError(err, { module: 'billing', op: 'reconcile-block', companyId: id })
      }
    }
  }
  return summary
}

// ─── Leitura: a faixa do ADMIN ───────────────────────────────────────────────

/** A fatura vencida mais antiga e a data prevista do aviso dela. */
async function oldestOverdueWithNotice(companyId: string, now: Date) {
  const invoice = await prisma.invoice.findFirst({
    where: { companyId, ...overdueInvoicesWhere(todaySaoPaulo(now)) },
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
    select: { id: true, number: true, competence: true, dueDate: true },
  })
  if (!invoice) return { invoice: null, notice: null, noticeSentAt: null }
  const event = await prisma.billingEvent.findUnique({
    where: { dedupeKey: noticeKey(invoice.id) },
    select: { createdAt: true, payload: true },
  })
  const notice = event ? noticeFromEvent(event) : null
  return { invoice, notice, noticeSentAt: notice && event ? event.createdAt : null }
}

/** GET /billing/me/overdue: a faixa de cobrança do ADMIN. */
export async function getOverdueStatus(
  companyId: string,
  now: Date
): Promise<BillingOverdueStatus> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { active: true, accessBlockedAt: true, accessBlockReason: true },
  })
  const { invoice, notice } = await oldestOverdueWithNotice(companyId, now)
  return {
    access: resolveCompanyAccess(company),
    blockedAt: company?.accessBlockedAt ? company.accessBlockedAt.toISOString() : null,
    invoice: invoice
      ? {
          id: invoice.id,
          number: invoice.number,
          competence: ymToIso(dateToCompetence(invoice.competence)),
          dueDate: dateToIsoDay(invoice.dueDate),
        }
      : null,
    plannedBlockDate: notice ? ymdToIsoDay(notice.plannedBlockYmd) : null,
  }
}

// ─── Ficha do cliente: o cartão "Acesso" e o "Liberar até…" ──────────────────

export interface CompanyBlockFields {
  active: boolean
  accessBlockedAt: Date | null
  accessBlockReason: 'OVERDUE' | 'MANUAL' | null
  blockExemptUntil: Date | null
}

/** O estado do bloqueio a partir da empresa já lida (a ficha não relê a empresa). */
export async function clientBlockStateFrom(
  companyId: string,
  company: CompanyBlockFields,
  now: Date
): Promise<ClientBlockState> {
  const todayYmd = ymdSaoPaulo(now)
  const exemptYmd = company.blockExemptUntil ? dateToYmdUtc(company.blockExemptUntil) : null
  const { invoice, notice, noticeSentAt } = await oldestOverdueWithNotice(companyId, now)
  return {
    companyActive: company.active,
    blockedAt: company.accessBlockedAt ? company.accessBlockedAt.toISOString() : null,
    // Bloqueio sem motivo vale OVERDUE, como no authenticate
    reason: company.accessBlockedAt ? (company.accessBlockReason ?? 'OVERDUE') : null,
    // Só a liberação vigente (até hoje, inclusive)
    exemptUntil: exemptYmd && exemptYmd >= todayYmd ? ymdToIsoDay(exemptYmd) : null,
    pendingNotice:
      invoice && notice && noticeSentAt
        ? {
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            sentAt: noticeSentAt.toISOString(),
            plannedBlockDate: ymdToIsoDay(notice.plannedBlockYmd),
          }
        : null,
  }
}

const COMPANY_BLOCK_SELECT = {
  active: true,
  accessBlockedAt: true,
  accessBlockReason: true,
  blockExemptUntil: true,
} satisfies Prisma.CompanySelect

export async function getClientBlockState(companyId: string, now: Date): Promise<ClientBlockState> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: COMPANY_BLOCK_SELECT,
  })
  if (!company) throw notFound('Cliente não encontrado')
  return clientBlockStateFrom(companyId, company, now)
}

export interface UnblockResult {
  block: ClientBlockState
  /** null = sem data, nenhum e-mail a enviar; false = o e-mail de liberação não saiu */
  emailSent: boolean | null
}

/**
 * "Liberar até…" (POST /admin/billing/clients/:companyId/unblock), só o
 * SUPERADMIN. Numa transação: limpa o bloqueio (qualquer motivo, inclusive um
 * MANUAL gravado à mão — é o único caminho para tirá-lo), grava a liberação
 * até `until` (ou a apaga) e o evento ACCESS_UNBLOCKED com o autor.
 *
 * - `until` entre hoje e hoje + MAX_EXEMPTION_DAYS (São Paulo); fora disso, 400;
 * - empresa liberada e sem `until` → 409 "Nada a liberar". Com `until`, funciona
 *   mesmo sem bloqueio: é a liberação antecipada de quem prometeu pagar;
 * - com `until`, depois da transação, o e-mail de liberação; falha no envio não
 *   desfaz nada (emailSent: false).
 *
 * Não existe o caminho inverso: o bloqueio manual está desabilitado.
 */
export async function unblockClient(
  companyId: string,
  input: { until?: string | null },
  actorId: string,
  now: Date
): Promise<UnblockResult> {
  const todayYmd = ymdSaoPaulo(now)
  const untilYmd = input.until ? input.until.replace(/-/g, '') : null
  if (untilYmd) {
    const maxYmd = addDaysYmd(todayYmd, MAX_EXEMPTION_DAYS)
    if (untilYmd < todayYmd || untilYmd > maxYmd) {
      throw badRequest(
        `Escolha uma data entre ${formatBillingDate(ymdToDate(todayYmd))} e ${formatBillingDate(ymdToDate(maxYmd))}.`,
        'UNBLOCK_UNTIL_OUT_OF_RANGE'
      )
    }
  }

  const companyName = await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { name: true, accessBlockedAt: true, accessBlockReason: true },
    })
    if (!company) throw notFound('Cliente não encontrado')
    if (!company.accessBlockedAt && !untilYmd) {
      throw conflict('Nada a liberar: o acesso já está liberado.', 'NOTHING_TO_UNBLOCK')
    }
    await tx.company.update({
      where: { id: companyId },
      data: {
        accessBlockedAt: null,
        accessBlockReason: null,
        blockExemptUntil: untilYmd ? ymdToDate(untilYmd) : null,
      },
    })
    await tx.billingEvent.create({
      data: {
        type: 'ACCESS_UNBLOCKED',
        companyId,
        actorId,
        payload: {
          previousReason: company.accessBlockedAt ? (company.accessBlockReason ?? 'OVERDUE') : null,
          until: untilYmd ? ymdToIsoDay(untilYmd) : null,
        },
      },
    })
    return company.name
  })

  let emailSent: boolean | null = null
  if (untilYmd) {
    emailSent = await sendAccessReleasedEmail(companyId, companyName, ymdToDate(untilYmd), now)
  }
  return { block: await getClientBlockState(companyId, now), emailSent }
}

/** Um e-mail por destinatário (o padrão do sendBillingEmail do 014). Nunca lança. */
async function sendAccessReleasedEmail(
  companyId: string,
  companyName: string,
  until: Date,
  now: Date
): Promise<boolean> {
  try {
    const [to, { invoice }] = await Promise.all([
      billingRecipients(companyId),
      oldestOverdueWithNotice(companyId, now),
    ])
    if (to.length === 0) return false
    const email = buildAccessReleasedEmail(companyName, until, invoice)
    const results = await Promise.all(
      to.map((address) => sendBillingEmail({ to: address, ...email }))
    )
    return results.every(Boolean)
  } catch (err) {
    captureError(err, { module: 'billing', op: 'access-released-email', companyId })
    return false
  }
}
