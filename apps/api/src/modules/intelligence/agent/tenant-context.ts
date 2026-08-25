// Contexto estável do tenant — "DADOS.md" (E6, doc §5.1): definições das
// consultas publicadas, premissas em prosa e tom. Vai como bloco de sistema
// com cache_control de 1h (D13) — estável entre chamadas do mesmo tenant.
import { createHash } from 'node:crypto'
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import { DEFAULT_INTELLIGENCE_CONFIG, type IntelligenceConfig } from '@addere/types'
import { resolveParameters, type ParameterOverride } from '../engine/parameters'
import { QUERY_CONTRACTS } from '../protheus-sql/contracts'
import { AGENT_SKILL } from './skill-prompt'

export function promptVersion(): string {
  return createHash('sha256').update(AGENT_SKILL).digest('hex').slice(0, 8)
}

export async function buildTenantContext(company: Company): Promise<string> {
  const [queries, parameterRows] = await Promise.all([
    prisma.intelQuery.findMany({
      where: { companyId: company.id, published: true },
      select: { name: true, definition: true, exclusions: true, gotchas: true },
    }),
    prisma.intelParameter.findMany({
      where: { companyId: company.id, segment: '' },
      select: { key: true, value: true, segment: true },
    }),
  ])
  const params = resolveParameters(parameterRows as ParameterOverride[])
  const config = {
    ...DEFAULT_INTELLIGENCE_CONFIG,
    ...((company.intelligenceConfig ?? {}) as Partial<IntelligenceConfig>),
  }

  const lines: string[] = ['# DADOS.md — como ler os números deste tenant', '']
  for (const query of queries) {
    const contract = QUERY_CONTRACTS[query.name]
    lines.push(`## ${contract.labelPt}`)
    if (query.definition) lines.push(`Definição: ${query.definition}`)
    if (query.exclusions) lines.push(`Exclui: ${query.exclusions}`)
    if (query.gotchas) lines.push(`Atenção: ${query.gotchas}`)
    lines.push('')
  }
  lines.push('## Premissas do motor')
  lines.push(
    `Cliente atrasado a partir de ${params.late_factor}× o ciclo; em risco a partir de ` +
      `${params.risk_factor}× o ciclo ou ${params.risk_days} dias; inativo após ${params.active_days} dias ` +
      `sem compra; bloqueio por título vencido há mais de ${params.blocked_days} dias.`
  )
  lines.push(`Tom padrão das mensagens: ${config.defaultTone}.`)

  return lines.join('\n')
}

/** Blocos de sistema: skill (estável global) + DADOS.md do tenant, ambos com cache 1h. */
export function systemBlocks(tenantContext: string) {
  return [
    { type: 'text' as const, text: AGENT_SKILL, cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } },
    { type: 'text' as const, text: tenantContext, cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } },
  ]
}
