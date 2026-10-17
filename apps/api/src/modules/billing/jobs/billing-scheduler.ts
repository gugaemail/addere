import { env, type Env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { isTransientDbError } from '../../intelligence/jobs/scheduler'
import { closeEndedContracts } from '../contract-cancel.service'
import { generateInvoices, type GenerateSummary } from '../invoices.service'
import {
  reconcileOverdueBlocks,
  sendSuspensionNotices,
  sendSuspensionReminders,
  type ReconcileSummary,
} from '../overdue-block.service'
import { sendDueReminders, sendPendingDocumentReminders, type ReminderSummary } from './reminders'

// Agendador do faturamento (plano 016), no molde do da Inteligência
// (intelligence/jobs/scheduler.ts): catch-up no boot, setInterval com unref e
// desligado em teste. Bate de hora em hora e só liga com
// BILLING_JOBS_ENABLED=true (nasce 'false' em todo lugar). Sem tabela de trava:
// cada passo é idempotente por chave única (fatura por competência, dedupeKey
// do e-mail), então dois processos durante um deploy ou um jobs/run manual no
// meio do tick não cobram nem avisam duas vezes.

const TICK_MS = 3_600_000 // de hora em hora

export interface BillingTickSummary {
  invoices: GenerateSummary | null
  contractsEnded: number | null
  dueReminders: ReminderSummary | null
  documentReminders: ReminderSummary | null
  // Plano 017
  suspensionNotices: ReminderSummary | null
  suspensionReminders: ReminderSummary | null
  overdueBlocks: ReconcileSummary | null
  errors: string[] // nomes dos passos que falharam
}

type StepName = Exclude<keyof BillingTickSummary, 'errors'>

// Ordem: gerar antes de encerrar. O gerador aceita o contrato ACTIVE com endsAt no mês e o já
// CANCELLED com endsAt no mês, então a ordem não muda o resultado — mas fica fixa e testada.
// Plano 017: o aviso de suspensão, o lembrete e o bloqueio/desbloqueio vêm depois dos do 016,
// nessa ordem — o aviso gravado neste tick só sustenta bloqueio 10 dias depois.
const STEPS = [
  ['invoices', generateInvoices],
  ['contractsEnded', closeEndedContracts],
  ['dueReminders', sendDueReminders],
  ['documentReminders', sendPendingDocumentReminders],
  ['suspensionNotices', sendSuspensionNotices],
  ['suspensionReminders', sendSuspensionReminders],
  ['overdueBlocks', reconcileOverdueBlocks],
] as const satisfies ReadonlyArray<readonly [StepName, (now: Date) => Promise<unknown>]>

export const BILLING_STEP_NAMES: readonly StepName[] = STEPS.map(([name]) => name)

/** Nunca lança: roda solto no boot e no setInterval (ver intelligence/jobs/scheduler.ts:97-103). */
export async function tickBillingScheduler(now: Date = new Date()): Promise<BillingTickSummary> {
  const summary: BillingTickSummary = {
    invoices: null,
    contractsEnded: null,
    dueReminders: null,
    documentReminders: null,
    suspensionNotices: null,
    suspensionReminders: null,
    overdueBlocks: null,
    errors: [],
  }
  for (const [name, run] of STEPS) {
    try {
      Object.assign(summary, { [name]: await run(now) })
    } catch (err) {
      // Um passo que falha não impede os seguintes
      summary.errors.push(name)
      if (isTransientDbError(err)) {
        // Banco piscando: a hora seguinte tenta de novo; alarme no Sentry seria falso
        console.warn(
          `[billing-scheduler] banco indisponível no passo ${name}; tenta de novo na próxima hora`
        )
      } else {
        captureError(err, { module: 'billing-scheduler', step: name })
      }
    }
  }
  return summary
}

export function shouldStartBillingScheduler(
  e: Pick<Env, 'NODE_ENV' | 'BILLING_JOBS_ENABLED'>
): boolean {
  return e.NODE_ENV !== 'test' && e.BILLING_JOBS_ENABLED === 'true'
}

let ticker: ReturnType<typeof setInterval> | null = null

export function initBillingScheduler(): void {
  if (ticker) return
  if (!shouldStartBillingScheduler(env)) {
    if (env.NODE_ENV !== 'test') {
      console.log('[billing-scheduler] desligado (BILLING_JOBS_ENABLED=false)')
    }
    return
  }
  const run = () =>
    void tickBillingScheduler().catch((err) =>
      captureError(err, { module: 'billing-scheduler', step: 'tick' })
    )
  // Primeiro tick já no boot = catch-up de horas perdidas por deploy/restart
  run()
  ticker = setInterval(run, TICK_MS)
  ticker.unref()
  console.log('[billing-scheduler] ticker de 1 h iniciado')
}
