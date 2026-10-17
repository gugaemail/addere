import { prisma } from '@addere/db'
import { env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { addDaysYmd, dateToYmdUtc, ymdToDate } from '../../intelligence/engine/business-days'
import {
  billingRecipients,
  documentPendingReminderEmail,
  dueReminderEmail,
  sendBillingEmailOnce,
  type SendOutcome,
} from '../billing-mailer'
import { todaySaoPaulo } from '../competence'
import { isValidDesignee } from '../designated-admin'
import { money } from '../invoice-rules'

// Lembretes do agendador do faturamento (plano 016, D11). Um de cada, nunca
// dois: o dedupeKey reserva o envio (billing-mailer.ts). O aviso de suspensão
// é do 017, que segue o mesmo padrão de dedupeKey ('invoice:<id>:<etapa>').

export interface ReminderSummary {
  sent: number
  duplicate: number
  skipped: number
  failed: number
}

/** Padrão do BillingSettings.dueReminderDays (013), se a linha não existir */
export const DEFAULT_DUE_REMINDER_DAYS = 3

/** Documento SENT há mais que isso recebe o lembrete de aceite */
export const PENDING_DOCUMENT_REMINDER_MS = 72 * 60 * 60 * 1000

const emptySummary = (): ReminderSummary => ({ sent: 0, duplicate: 0, skipped: 0, failed: 0 })

function warnIfNoKey(summary: ReminderSummary, what: string): void {
  // Um aviso por chamada, não por fatura
  if (summary.skipped > 0 && !env.RESEND_API_KEY) {
    console.warn(`[billing] RESEND_API_KEY não configurada — ${what} não enviados`)
  }
}

async function tally(
  summary: ReminderSummary,
  context: Record<string, unknown>,
  send: () => Promise<SendOutcome>
): Promise<void> {
  try {
    summary[await send()]++
  } catch (err) {
    // Erro de banco na reserva: nada foi enviado, a hora seguinte tenta de novo
    summary.failed++
    captureError(err, context)
  }
}

/**
 * Lembrete de vencimento: fatura OPEN, com total > 0, que vence entre hoje e
 * hoje + N dias, em datas de São Paulo. Sai no primeiro tick dentro da janela
 * e não sai de novo (dedupeKey `invoice:<id>:due-reminder`). Vai para o
 * contato de cobrança e para os ADMINs ativos da empresa.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const summary = emptySummary()
  const today = todaySaoPaulo(now)
  const settings = await prisma.billingSettings.findUnique({
    where: { id: 'global' },
    select: { dueReminderDays: true },
  })
  const days = settings?.dueReminderDays ?? DEFAULT_DUE_REMINDER_DAYS
  const until = ymdToDate(addDaysYmd(dateToYmdUtc(today), days))

  const invoices = await prisma.invoice.findMany({
    where: { status: 'OPEN', total: { gt: 0 }, dueDate: { gte: today, lte: until } },
    select: {
      id: true,
      number: true,
      companyId: true,
      competence: true,
      dueDate: true,
      total: true,
      company: { select: { name: true } },
      items: { select: { description: true, amount: true }, orderBy: { createdAt: 'asc' } },
    },
    orderBy: { dueDate: 'asc' },
  })

  for (const invoice of invoices) {
    await tally(
      summary,
      { module: 'billing', op: 'due-reminder', invoiceId: invoice.id },
      async () => {
        const email = dueReminderEmail(invoice.company.name, {
          number: invoice.number,
          competence: invoice.competence,
          dueDate: invoice.dueDate,
          total: money(invoice.total),
          items: invoice.items.map((i) => ({
            description: i.description,
            amount: money(i.amount),
          })),
        })
        return sendBillingEmailOnce({
          companyId: invoice.companyId,
          dedupeKey: `invoice:${invoice.id}:due-reminder`,
          eventType: 'INVOICE_DUE_REMINDER_SENT',
          payload: { invoiceId: invoice.id, invoiceNumber: invoice.number },
          to: await billingRecipients(invoice.companyId),
          ...email,
        })
      }
    )
  }

  warnIfNoKey(summary, 'lembretes de vencimento')
  return summary
}

/**
 * Lembrete de documento pendente: contrato ou aditivo SENT há 72 h ou mais.
 * Um só (dedupeKey `document:<id>:pending-reminder`), para o administrador
 * indicado (decisão 10: só ele aceita). Indicado ausente ou que deixou de ser
 * ADMIN ativo da empresa: 'skipped' (a aba Contrato já mostra o aviso).
 */
export async function sendPendingDocumentReminders(
  now: Date = new Date()
): Promise<ReminderSummary> {
  const summary = emptySummary()
  const documents = await prisma.contractDocument.findMany({
    where: {
      status: 'SENT',
      sentAt: { lte: new Date(now.getTime() - PENDING_DOCUMENT_REMINDER_MS) },
    },
    select: {
      id: true,
      kind: true,
      companyId: true,
      contract: {
        select: {
          designatedAdmin: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
              companyId: true,
            },
          },
        },
      },
    },
    orderBy: { sentAt: 'asc' },
  })

  for (const doc of documents) {
    await tally(
      summary,
      { module: 'billing', op: 'document-reminder', documentId: doc.id },
      async () => {
        const designee = doc.contract.designatedAdmin
        const valid = designee && isValidDesignee(designee, doc.companyId)
        const email = documentPendingReminderEmail(doc, valid ? designee.name : '')
        return sendBillingEmailOnce({
          companyId: doc.companyId,
          dedupeKey: `document:${doc.id}:pending-reminder`,
          eventType: 'DOCUMENT_PENDING_REMINDER_SENT',
          payload: { documentId: doc.id, documentKind: doc.kind },
          to: valid ? [designee.email] : [],
          ...email,
        })
      }
    )
  }

  warnIfNoKey(summary, 'lembretes de documento pendente')
  return summary
}
