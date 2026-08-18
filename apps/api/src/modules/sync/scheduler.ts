import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { syncProducts } from './products.sync'
import { syncCustomers } from './customers.sync'

// Map: companyId → { products?: NodeJS.Timeout, customers?: NodeJS.Timeout }
const timers = new Map<string, { products?: NodeJS.Timeout; customers?: NodeJS.Timeout }>()

// Guarda contra execuções sobrepostas: se um sync da empresa ainda está
// rodando quando o intervalo dispara de novo, o novo disparo é ignorado
const running = new Set<string>()

function getEntry(companyId: string) {
  if (!timers.has(companyId)) timers.set(companyId, {})
  return timers.get(companyId)!
}

function runSafe(key: string, fn: () => Promise<unknown>) {
  if (running.has(key)) return
  running.add(key)
  fn()
    .catch((err) => {
      console.error(`[scheduler] Erro no auto-sync ${key}:`, (err as Error).message)
    })
    .finally(() => running.delete(key))
}

export function applySchedule(companyId: string, schedule: SyncSchedule) {
  const entry = getEntry(companyId)

  // Produtos
  if (entry.products) clearInterval(entry.products)
  entry.products = undefined
  if (schedule.products.auto && schedule.products.scheduleMin > 0) {
    const ms = schedule.products.scheduleMin * 60_000
    entry.products = setInterval(
      () => runSafe(`products/${companyId}`, () => syncProducts(companyId, 'autoSyncProducts')),
      ms
    )
    console.log(
      `[scheduler] Auto-sync produtos iniciado para ${companyId} (a cada ${schedule.products.scheduleMin} min, INTERV=${schedule.products.interv})`
    )
  }

  // Clientes
  if (entry.customers) clearInterval(entry.customers)
  entry.customers = undefined
  if (schedule.customers.auto && schedule.customers.scheduleMin > 0) {
    const ms = schedule.customers.scheduleMin * 60_000
    entry.customers = setInterval(
      () => runSafe(`customers/${companyId}`, () => syncCustomers(companyId, 'autoSyncCustomers')),
      ms
    )
    console.log(
      `[scheduler] Auto-sync clientes iniciado para ${companyId} (a cada ${schedule.customers.scheduleMin} min, INTERV=${schedule.customers.interv})`
    )
  }
}

export function clearSchedule(companyId: string) {
  const entry = timers.get(companyId)
  if (!entry) return
  if (entry.products) clearInterval(entry.products)
  if (entry.customers) clearInterval(entry.customers)
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
      products: { ...DEFAULT_SYNC_SCHEDULE.products, ...(s?.products ?? {}) },
      customers: { ...DEFAULT_SYNC_SCHEDULE.customers, ...(s?.customers ?? {}) },
    }
    const hasAny =
      (schedule.products.auto && schedule.products.scheduleMin > 0) ||
      (schedule.customers.auto && schedule.customers.scheduleMin > 0)
    if (hasAny) {
      applySchedule(company.id, schedule)
      started++
    }
  }

  console.log(`[scheduler] initSchedulers: ${started} empresa(s) com auto-sync ativo`)
}
