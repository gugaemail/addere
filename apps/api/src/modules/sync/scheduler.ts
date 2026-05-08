import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { syncProducts, syncCustomers } from './sync.service'

// Map: companyId → { products?: NodeJS.Timeout, customers?: NodeJS.Timeout }
const timers = new Map<string, { products?: NodeJS.Timeout; customers?: NodeJS.Timeout }>()

function getEntry(companyId: string) {
  if (!timers.has(companyId)) timers.set(companyId, {})
  return timers.get(companyId)!
}

function runSafe(label: string, fn: () => Promise<unknown>) {
  fn().catch((err) => {
    console.error(`[scheduler] Erro no auto-sync ${label}:`, (err as Error).message)
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
      () => runSafe(`products/${companyId}`, () => syncProducts(companyId)),
      ms,
    ) as unknown as NodeJS.Timeout
    console.log(`[scheduler] Auto-sync produtos iniciado para ${companyId} (a cada ${schedule.products.scheduleMin} min, INTERV=${schedule.products.interv})`)
  }

  // Clientes
  clearTimeout(entry.customers)
  entry.customers = undefined
  if (schedule.customers.auto && schedule.customers.scheduleMin > 0) {
    const ms = schedule.customers.scheduleMin * 60_000
    entry.customers = setInterval(
      () => runSafe(`customers/${companyId}`, () => syncCustomers(companyId)),
      ms,
    ) as unknown as NodeJS.Timeout
    console.log(`[scheduler] Auto-sync clientes iniciado para ${companyId} (a cada ${schedule.customers.scheduleMin} min, INTERV=${schedule.customers.interv})`)
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

  console.log(`[scheduler] initSchedulers: ${started} empresa(s) com auto-sync ativo`)
}
