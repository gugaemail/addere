import {
  addDaysYmd,
  daysOverdueOn,
  diffDays,
  ymdToDate,
} from '../intelligence/engine/business-days'

// Inadimplência (plano 017): a regra do aviso de suspensão e do bloqueio por
// atraso, como funções puras. Datas em 'YYYYMMDD', dia civil de São Paulo
// (helpers de business-days.ts). Quem chama converte instantes com
// ymdSaoPaulo e @db.Date com dateToYmdUtc.
//
// O contrato (§6.5 e §6.6) promete o aviso com a data prevista, enviado com no
// mínimo 10 dias corridos de antecedência. É isto que o sistema garante: sem
// aviso gravado, nunca há bloqueio, por mais atrasada que esteja a fatura.

/** Piso contratual entre o aviso de suspensão e o bloqueio. Não é configuração. */
export const MIN_NOTICE_DAYS = 10
/** Lembrete antes da data prevista. */
export const REMINDER_DAYS_BEFORE = 3
/** Teto do "Liberar até…" (liberação pelo superadmin, com data). */
export const MAX_EXEMPTION_DAYS = 90

/** max(vencimento + overdueBlockDays, envio + 10 dias corridos). */
export function computePlannedBlockDate(input: {
  dueYmd: string
  overdueBlockDays: number
  sentYmd: string
}): string {
  const byOverdueDays = addDaysYmd(input.dueYmd, input.overdueBlockDays)
  const byMinNotice = addDaysYmd(input.sentYmd, MIN_NOTICE_DAYS)
  // 'YYYYMMDD' compara como texto na ordem do calendário
  return byOverdueDays > byMinNotice ? byOverdueDays : byMinNotice
}

/** Aviso vence no dia seguinte ao vencimento (ou depois, se o job atrasou). */
export function noticeDue(input: {
  status: string
  dueYmd: string
  todayYmd: string
  hasNotice: boolean
}): boolean {
  return (
    input.status === 'OPEN' &&
    !input.hasNotice &&
    daysOverdueOn(ymdToDate(input.dueYmd), input.todayYmd) >= 1
  )
}

/** Lembrete: fatura em aberto, aviso enviado, faltam de 1 a 3 dias para a data. */
export function reminderDue(input: {
  status: string
  todayYmd: string
  plannedBlockYmd: string
  hasReminder: boolean
  exemptUntilYmd: string | null
}): boolean {
  if (input.status !== 'OPEN' || input.hasReminder) return false
  const daysLeft = diffDays(input.todayYmd, input.plannedBlockYmd)
  if (daysLeft < 1 || daysLeft > REMINDER_DAYS_BEFORE) return false
  // Liberação que cobre a data prevista: a suspensão não acontece nesse dia
  return input.exemptUntilYmd === null || input.exemptUntilYmd < input.plannedBlockYmd
}

export interface NoticeOnInvoice {
  sentYmd: string
  plannedBlockYmd: string
}

/**
 * A fatura sustenta o bloqueio hoje? Só em aberto, com aviso gravado há pelo
 * menos MIN_NOTICE_DAYS dias corridos E com a data prevista alcançada. A
 * segunda condição já implica a primeira quando a data foi calculada certa;
 * a primeira fica como defesa, porque é ela que o contrato promete.
 */
export function invoiceSustainsBlock(
  invoice: { status: string; notice: NoticeOnInvoice | null },
  todayYmd: string
): boolean {
  const { notice } = invoice
  if (invoice.status !== 'OPEN' || !notice) return false
  return diffDays(notice.sentYmd, todayYmd) >= MIN_NOTICE_DAYS && todayYmd >= notice.plannedBlockYmd
}

/** A liberação do superadmin vale até o fim do dia `exemptUntilYmd`, inclusive. */
export function exemptionActive(exemptUntilYmd: string | null, todayYmd: string): boolean {
  return exemptUntilYmd !== null && exemptUntilYmd >= todayYmd
}

/**
 * O bloqueio por atraso se sustenta? Só com:
 * - autoBlockEnabled;
 * - nenhuma liberação vigente (exemptUntilYmd >= hoje);
 * - pelo menos uma fatura OPEN com aviso gravado há >= MIN_NOTICE_DAYS dias
 *   corridos E data prevista alcançada.
 * Sem aviso gravado, nunca — por mais atrasada que esteja a fatura.
 */
export function overdueBlockHolds(input: {
  autoBlockEnabled: boolean
  exemptUntilYmd: string | null
  todayYmd: string
  invoices: Array<{
    status: string
    notice: NoticeOnInvoice | null
  }>
}): boolean {
  if (!input.autoBlockEnabled) return false
  if (exemptionActive(input.exemptUntilYmd, input.todayYmd)) return false
  return input.invoices.some((invoice) => invoiceSustainsBlock(invoice, input.todayYmd))
}
