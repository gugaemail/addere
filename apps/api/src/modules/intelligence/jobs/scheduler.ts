// Scheduler in-process da Inteligência (E4, decisão D5): ticker de 1 min +
// catch-up no boot, horários por empresa em intelligenceConfig.
// Padrão do painel (initSchedulers do auto-sync); sem cron externo — o
// keep-alive do Render é pré-requisito operacional do noturno.
import { prisma } from '@addere/db'
import type { IntelJob } from '@addere/types'
import { env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { mergeIntelligenceConfig } from '../admin/config.routes'
import { startJobRun } from './run-job'

const TICK_MS = 60_000
const HOUR_MS = 3_600_000

// ─── Helpers puros (testáveis com relógio mockado) ───

const SP_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

function spParts(date: Date): { dayKey: string; hour: number } {
  const parts = SP_FMT.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { dayKey: `${get('year')}${get('month')}${get('day')}`, hour: Number(get('hour')) }
}

export interface DueInput {
  now: Date
  syncHour: number // hora BRT do noturno
  syncEveryHours: number // intervalo do refresh
  lastNightlyAt: Date | null // último início (qualquer status — evita retry em loop)
  lastRefreshAt: Date | null
}

/** Decide quais jobs estão vencidos — inclui o catch-up no boot (D5). */
export function computeDueJobs(input: DueInput): IntelJob[] {
  const due: IntelJob[] = []
  const nowSp = spParts(input.now)

  const nightlyRanToday =
    input.lastNightlyAt !== null && spParts(input.lastNightlyAt).dayKey === nowSp.dayKey
  if (nowSp.hour >= input.syncHour && !nightlyRanToday) due.push('NIGHTLY')

  const refreshAge =
    input.lastRefreshAt === null ? Infinity : input.now.getTime() - input.lastRefreshAt.getTime()
  if (refreshAge >= input.syncEveryHours * HOUR_MS) due.push('REFRESH')

  return due
}

// ─── Ticker ───

async function lastRunStartedAt(companyId: string, job: IntelJob): Promise<Date | null> {
  const run = await prisma.intelJobRun.findFirst({
    where: { companyId, job },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  })
  return run?.startedAt ?? null
}

// ─── Queda de conexão com o banco ───
// O Neon pisca às vezes (reinício, manutenção) e o tick seguinte, 1 min
// depois, já funciona. Avisar o Sentry a cada piscada vira alarme falso; só
// avisa quando a queda dura DB_ALERT_AFTER_TICKS ticks seguidos. Qualquer outro
// erro (drift de schema, bug) continua avisando na hora.
const TRANSIENT_DB_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])
export const DB_ALERT_AFTER_TICKS = 3

/** Banco inalcançável/lento — Prisma marca com `code` (request) ou `errorCode` (inicialização) */
export function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: unknown; errorCode?: unknown } | null
  const code =
    typeof e?.code === 'string' ? e.code : typeof e?.errorCode === 'string' ? e.errorCode : null
  return code !== null && TRANSIENT_DB_CODES.has(code)
}

let dbFailureStreak = 0

// Visível para testes
export function resetDbFailureStreak(): void {
  dbFailureStreak = 0
}

function listEnabledCompanies() {
  return prisma.company.findMany({
    where: { active: true, intelligenceEnabled: true },
    select: { id: true, intelligenceConfig: true },
  })
}

/**
 * Um tick nunca propaga erro. Ele roda solto (`void`) no boot e no setInterval:
 * no Node 26 uma rejeição não tratada encerra o processo, então uma falha aqui
 * — drift de schema, banco piscando — tiraria a API inteira do ar em vez de
 * apenas desligar a Inteligência.
 */
export async function tickIntelScheduler(now: Date = new Date()): Promise<void> {
  let dbDown: unknown = null
  const report = (err: unknown, context: Record<string, unknown>) => {
    if (isTransientDbError(err)) dbDown = err
    else captureError(err, context)
  }

  let companies: Awaited<ReturnType<typeof listEnabledCompanies>> = []
  try {
    companies = await listEnabledCompanies()
  } catch (err) {
    report(err, { module: 'intel-scheduler' })
    console.error('[intel-scheduler] falha ao listar empresas:', (err as Error).message)
  }

  for (const company of companies) {
    try {
      const config = mergeIntelligenceConfig(company.intelligenceConfig)
      const [lastNightlyAt, lastRefreshAt] = await Promise.all([
        lastRunStartedAt(company.id, 'NIGHTLY'),
        lastRunStartedAt(company.id, 'REFRESH'),
      ])
      const due = computeDueJobs({
        now,
        syncHour: config.syncHour,
        syncEveryHours: config.syncEveryHours,
        lastNightlyAt,
        lastRefreshAt,
      })
      // Noturno tem prioridade; o lock em IntelJobRun impede duplicidade
      for (const job of due) {
        await startJobRun(company.id, job)
      }
    } catch (err) {
      report(err, { module: 'intel-scheduler', companyId: company.id })
      console.error(`[intel-scheduler] empresa ${company.id}:`, (err as Error).message)
    }
  }

  // Uma queda conta uma vez por tick, por mais empresas que tenham falhado
  if (dbDown === null) {
    dbFailureStreak = 0
    return
  }
  dbFailureStreak++
  if (dbFailureStreak === DB_ALERT_AFTER_TICKS) {
    captureError(dbDown, { module: 'intel-scheduler', dbFailureStreak })
  }
}

let ticker: ReturnType<typeof setInterval> | null = null

export function initIntelScheduler(): void {
  if (env.NODE_ENV === 'test' || ticker) return
  // Primeiro tick já no boot = catch-up de horários perdidos por deploy/restart
  void tickIntelScheduler()
  ticker = setInterval(() => void tickIntelScheduler(), TICK_MS)
  ticker.unref()
  console.log('[intel-scheduler] ticker de 1 min iniciado')
}
