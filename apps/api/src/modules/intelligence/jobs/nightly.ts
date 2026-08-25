// Job noturno da Inteligência (E4): sync dos contratos vencidos + metas +
// motor/plano (registrados por E5/E6) + expurgo LGPD. Erros de passo não
// interrompem os demais; qualquer erro deixa o run em ERROR com o resumo.
import { prisma } from '@addere/db'
import type { IntelJob } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { mergeIntelligenceConfig } from '../admin/config.routes'
import { publishedContracts, syncContract } from '../sync/contract-sync.service'
import { captureGoals } from '../sync/goals.service'
import { getJobHandler } from './registry'
import { updateRunMetadata } from './run-job'
import { purgeCompany } from './purge'

interface StepResult {
  step: string
  ok: boolean
  detail?: unknown
  error?: string
}

function isSundaySaoPaulo(date: Date): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(
      date
    ) === 'Sun'
  )
}

export async function nightlyHandler(companyId: string, runId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!company.intelligenceEnabled) throw unprocessable('Camada de Inteligência desligada')

  const config = mergeIntelligenceConfig(company.intelligenceConfig)
  const steps: StepResult[] = []
  const record = async (step: string, fn: () => Promise<unknown>) => {
    try {
      const detail = await fn()
      steps.push({ step, ok: true, detail })
    } catch (err) {
      steps.push({ step, ok: false, error: (err as Error).message.slice(0, 300) })
    }
    await updateRunMetadata(runId, { steps }).catch(() => undefined)
  }

  // 1. Sync dos contratos: diários + semanais (domingo) + os de refresh (janela 7d)
  const frequencies: Array<'DAILY' | 'REFRESH' | 'WEEKLY'> = isSundaySaoPaulo(new Date())
    ? ['DAILY', 'REFRESH', 'WEEKLY']
    : ['DAILY', 'REFRESH']
  const contracts = await publishedContracts(companyId, frequencies)
  for (const name of contracts) {
    await record(`sync:${name}`, async () => {
      const result = await syncContract(company, name)
      return { rows: result.rows, synced: result.synced, errors: result.errors.slice(0, 5) }
    })
  }
  if (contracts.length === 0) {
    steps.push({ step: 'sync', ok: true, detail: 'nenhum contrato publicado' })
  }

  // 2. Geocodificação de clientes novos/alterados (E15-F1) — antes do motor,
  // que copia lat/lng do cache para os itens do plano
  const geo = getJobHandler('GEO')
  if (geo) {
    await record('geo', () => geo(companyId, runId))
  } else {
    steps.push({ step: 'geo', ok: true, detail: 'não implementado (E15-F1)' })
  }

  // 3. Metas por vendedor (mês atual + anterior)
  await record('goals', () => captureGoals(company))

  // 4. Motor de sinais e resumo do plano — handlers chegam na E5/E6
  for (const dependent of ['ENGINE', 'PLAN'] as IntelJob[]) {
    const handler = getJobHandler(dependent)
    if (!handler) {
      steps.push({ step: dependent.toLowerCase(), ok: true, detail: 'não implementado (E5/E6)' })
      continue
    }
    await record(dependent.toLowerCase(), () => handler(companyId, runId))
  }

  // 5. Expurgo de retenção (§2.13)
  await record('purge', () => purgeCompany(companyId, config))

  await updateRunMetadata(runId, { steps }).catch(() => undefined)

  const failed = steps.filter((s) => !s.ok)
  if (failed.length > 0) {
    throw new Error(`${failed.length} passo(s) falharam: ${failed.map((s) => s.step).join(', ')}`)
  }
}
