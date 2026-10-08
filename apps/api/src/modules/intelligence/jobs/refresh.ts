// Job de refresh intradiário (E4): contratos de frequência REFRESH
// (SALES e OPEN_TITLES; só o que mudou quando a consulta usa {{DESDE}} — plano 009)
// e a meta do mês atual, para a tela Hoje não esperar a noite.
import { prisma } from '@addere/db'
import { unprocessable } from '../../../lib/errors'
import { publishedContracts, syncContract } from '../sync/contract-sync.service'
import { captureGoals } from '../sync/goals.service'
import { updateRunMetadata } from './run-job'

export async function refreshHandler(companyId: string, runId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!company.intelligenceEnabled) throw unprocessable('Camada de Inteligência desligada')

  const contracts = await publishedContracts(companyId, ['REFRESH'])
  const steps: Array<Record<string, unknown>> = []
  const errors: string[] = []

  for (const name of contracts) {
    try {
      const result = await syncContract(company, name)
      steps.push({
        step: `sync:${name}`,
        ok: true,
        mode: result.mode,
        rows: result.rows,
        synced: result.synced,
      })
    } catch (err) {
      const message = (err as Error).message.slice(0, 300)
      steps.push({ step: `sync:${name}`, ok: false, error: message })
      errors.push(`${name}: ${message}`)
    }
    await updateRunMetadata(runId, { steps }).catch(() => undefined)
  }

  if (company.apiMetaVend) {
    try {
      const result = await captureGoals(company, { currentOnly: true })
      const ok = result.captured > 0 || result.errors.length === 0
      steps.push({
        step: 'goals',
        ok,
        captured: result.captured,
        errors: result.errors.slice(0, 3),
      })
      if (!ok) errors.push(`metas: ${result.errors.slice(0, 3).join(' | ')}`)
    } catch (err) {
      const message = (err as Error).message.slice(0, 300)
      steps.push({ step: 'goals', ok: false, error: message })
      errors.push(`metas: ${message}`)
    }
    await updateRunMetadata(runId, { steps }).catch(() => undefined)
  }

  if (errors.length > 0) throw new Error(errors.join(' | '))
}
