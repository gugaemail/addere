// Registro de handlers dos jobs da Inteligência (E3; handlers reais na E4+).
// E4 registra SYNC/GOALS/NIGHTLY/REFRESH/PURGE; E5 registra ENGINE; E6, PLAN.
import type { IntelJob } from '@addere/types'

export type IntelJobHandler = (companyId: string, runId: string) => Promise<unknown>

const registry = new Map<IntelJob, IntelJobHandler>()

export function registerJobHandler(job: IntelJob, handler: IntelJobHandler): void {
  registry.set(job, handler)
}

export function getJobHandler(job: IntelJob): IntelJobHandler | undefined {
  return registry.get(job)
}

// Visível para testes
export function clearJobRegistry(): void {
  registry.clear()
}
