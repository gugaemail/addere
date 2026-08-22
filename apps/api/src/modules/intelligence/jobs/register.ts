// Registro dos handlers de job disponíveis nesta entrega (E4).
// E5 registra ENGINE (engine/engine.job.ts) e E6 registra PLAN.
import { mergeIntelligenceConfig } from '../admin/config.routes'
import { prisma } from '@addere/db'
import { registerJobHandler } from './registry'
import { registerEngineJob } from '../engine/engine.job'
import { registerPlanJob } from '../agent/plan-summary.job'
import { registerGeoJob } from '../geo/geo.job'
import { nightlyHandler } from './nightly'
import { refreshHandler } from './refresh'
import { purgeCompany } from './purge'

export function registerIntelJobHandlers(): void {
  registerEngineJob()
  registerPlanJob()
  registerGeoJob()
  registerJobHandler('NIGHTLY', nightlyHandler)
  registerJobHandler('REFRESH', refreshHandler)
  registerJobHandler('PURGE', async (companyId) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { intelligenceConfig: true },
    })
    await purgeCompany(companyId, mergeIntelligenceConfig(company?.intelligenceConfig))
  })
}
