// Carga inicial manual (E4, P5): 13 meses em janelas mensais, job SYNC com
// lock folgado e progresso em IntelJobRun.metadata (tela Consultas, E10).
// O nightly NUNCA dispara backfill — só o botão do painel chama esta rotina.
import { prisma } from '@addere/db'
import type { IntelQueryName } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { monthlyWindows } from '../sync/windows'
import { syncContract } from '../sync/contract-sync.service'
import { extendLock, updateRunMetadata, type StartJobOptions } from './run-job'

export const BACKFILL_MONTHS = 13
export const BACKFILL_LOCK_MINUTES = 120

export function backfillOptions(name: IntelQueryName): StartJobOptions {
  return {
    lockMinutes: BACKFILL_LOCK_MINUTES,
    metadata: { kind: 'backfill', contract: name, done: 0, total: BACKFILL_MONTHS },
    handler: (companyId, runId) => backfillHandler(companyId, runId, name),
  }
}

async function backfillHandler(
  companyId: string,
  runId: string,
  name: IntelQueryName
): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')

  // Só SALES é histórico por janela; os demais fazem uma carga completa única
  if (name !== 'SALES') {
    const result = await syncContract(company, name, undefined, { backfill: true })
    await updateRunMetadata(runId, {
      kind: 'backfill',
      contract: name,
      done: 1,
      total: 1,
      rows: result.rows,
      synced: result.synced,
    })
    return
  }

  const windows = monthlyWindows(BACKFILL_MONTHS)
  const progress: Array<Record<string, unknown>> = []
  const errors: string[] = []

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    try {
      const result = await syncContract(company, name, window, { backfill: true })
      progress.push({ window: window.dataIni.slice(0, 6), rows: result.rows, synced: result.synced })
    } catch (err) {
      const message = (err as Error).message.slice(0, 200)
      progress.push({ window: window.dataIni.slice(0, 6), error: message })
      errors.push(`${window.dataIni.slice(0, 6)}: ${message}`)
    }
    await extendLock(runId, BACKFILL_LOCK_MINUTES).catch(() => undefined)
    await updateRunMetadata(runId, {
      kind: 'backfill',
      contract: name,
      done: i + 1,
      total: windows.length,
      progress,
    }).catch(() => undefined)
  }

  if (errors.length > 0) {
    throw new Error(`Backfill com falhas em ${errors.length} janela(s): ${errors.join(' | ')}`)
  }
}
