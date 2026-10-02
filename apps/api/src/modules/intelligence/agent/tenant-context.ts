// Contexto estável do tenant — "DADOS.md" (E6, doc §5.1): definições das
// consultas publicadas, premissas em prosa e tom. Vai como bloco de sistema
// atrás do skill, estável entre chamadas do mesmo tenant (ver systemBlocks).
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

type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/**
 * Blocos de sistema: skill (global) + DADOS.md do tenant, com UM breakpoint de
 * cache, no último bloco. O que se repete entre chamadas do mesmo tenant é o
 * prefixo inteiro; um marcador no skill sozinho (~300 tokens) nunca gravaria
 * nada, porque fica abaixo do mínimo cacheável de qualquer modelo (1024 no
 * Sonnet 5). Abaixo do mínimo a API não grava nem cobra — o marcador só passa
 * a valer quando o DADOS.md do tenant cresce o bastante.
 *
 * TTL padrão (5 min), não 1h: o grosso das chamadas é o job PLAN, que percorre
 * os vendedores em sequência com segundos entre uma e outra. Cada leitura
 * renova o timer, e a escrita custa 1,25× em vez dos 2× do TTL de 1h, que só
 * se pagava com três leituras na mesma hora.
 *
 * Sem contexto (empresa não encontrada) não entra bloco vazio: seria um
 * prefixo diferente de todas as outras chamadas, e texto vazio nem é aceito
 * pela API.
 */
export function systemBlocks(tenantContext: string): SystemBlock[] {
  const texts = [AGENT_SKILL, tenantContext].filter((text) => text.trim() !== '')
  return texts.map((text, i) =>
    i === texts.length - 1
      ? { type: 'text', text, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text }
  )
}
