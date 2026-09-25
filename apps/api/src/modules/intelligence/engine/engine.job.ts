// Registro do job ENGINE (E5). O PLAN (resumo do agente) chega na E6.
import { registerJobHandler } from '../jobs/registry'
import { runEngine } from './engine.service'

export function registerEngineJob(): void {
  registerJobHandler('ENGINE', (companyId, runId) => runEngine(companyId, runId))
}
