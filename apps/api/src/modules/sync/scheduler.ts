import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { syncProducts, syncCustomers } from './sync.service'
import { logger } from '../../lib/logger'

// Map: companyId → { products?: NodeJS.Timeout, customers?: NodeJS.Timeout }
const timers = new Map<string, { products?: NodeJS.Timeout; customers?: NodeJS.Timeout }>()

function getEntry(companyId: string) {
  if (!timers.has(companyId)) timers.set(companyId, {})
  return timers.get(companyId)!
}

function runSafe(label: string, fn: () => Promise<unknown>) {
  fn().catch((err) => {
    logger.error({ err, label }, '[scheduler] Erro no auto-sync')
  })
}

export function applySchedule(companyId: string, schedule: SyncSchedule) {
  const entry = getEntry(companyId)

  // Produtos
  clearTimeout(entry.products)
  entry.products = undefined
  if (schedule.products.auto && schedule.products.scheduleMin > 0) {
    const ms = schedule.products.scheduleMin * 60_000
    entry.products = setInterval(
      () => runSafe(`products/${companyId}`, () => syncProducts(companyId, 'autoSyncProducts')),
      ms,
    ) as unknown as NodeJS.Timeout
    logger.info({ companyId, scheduleMin: schedule.products.scheduleMin, interv: schedule.products.interv }, '[scheduler] Auto-sync produtos iniciado')
  }

  // Clientes
  clearTimeout(entry.customers)
  entry.customers = undefined
  if (schedule.customers.auto && schedule.customers.scheduleMin > 0) {
    const ms = schedule.customers.scheduleMin * 60_000
    entry.customers = setInterval(
      () => runSafe(`customers/${companyId}`, () => syncCustomers(companyId, 'autoSyncCustomers')),
      ms,
    ) as unknown as NodeJS.Timeout
    logger.info({ companyId, scheduleMin: schedule.customers.scheduleMin, interv: schedule.customers.interv }, '[scheduler] Auto-sync clientes iniciado')
  }
}

export function clearSchedule(companyId: string) {
  const entry = timers.get(companyId)
  if (!entry) return
  clearInterval(entry.products as unknown as number)
  clearInterval(entry.customers as unknown as number)
  timers.delete(companyId)
}

export async function initSchedulers() {
  const companies = await prisma.company.findMany({
    where: { active: true },
    select: { id: true, syncSchedule: true },
  })

  let started = 0
  for (const company of companies) {
    const s = company.syncSchedule as Partial<SyncSchedule> | null
    const schedule: SyncSchedule = {
      products:  { ...DEFAULT_SYNC_SCHEDULE.products,  ...(s?.products  ?? {}) },
      customers: { ...DEFAULT_SYNC_SCHEDULE.customers, ...(s?.customers ?? {}) },
    }
    const hasAny = (schedule.products.auto && schedule.products.scheduleMin > 0)
                || (schedule.customers.auto && schedule.customers.scheduleMin > 0)
    if (hasAny) {
      applySchedule(company.id, schedule)
      started++
    }
  }

  logger.info({ started }, '[scheduler] initSchedulers concluído')
}
