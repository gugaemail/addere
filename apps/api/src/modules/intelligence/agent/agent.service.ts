// Serviço do agente (E6): cache 4h por (companyId, kind, vendorCode, targetKey),
// cap diário de tokens por tenant (D13), allowlist de fatos como defesa em
// profundidade e self-check com 1 regeneração — falhou tudo, entrega só-motor.
import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { complete, llmAvailable, type LlmUsage } from './client'
import { validateFactsPayload } from './facts'
import { selfCheck, type SelfCheckFacts } from './self-check'

const CACHE_HOURS = 4

export type AgentKind = 'today' | 'briefing' | 'message'

export interface GenerateInput<T> {
  companyId: string
  kind: AgentKind
  vendorCode: string
  targetKey: string
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '1h' } }>
  userPrompt: string
  schema: Record<string, unknown>
  factsPayload: unknown // valida a allowlist antes de sair (LGPD)
  selfCheckFacts: SelfCheckFacts
  /** Extrai o texto a validar no self-check a partir do JSON do modelo */
  extractText: (data: T) => string
}

export interface GenerateOutput<T> {
  data: T | null
  source: 'llm' | 'cache' | 'engine'
  reason?: string // presente quando source='engine'
}

export async function dailyTokensUsed(companyId: string, now: Date = new Date()): Promise<number> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const sum = await prisma.intelLlmCache.aggregate({
    where: { companyId, createdAt: { gte: dayStart } },
    _sum: { inputTokens: true, outputTokens: true },
  })
  return (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0)
}

export async function generateWithGuardrails<T>(
  input: GenerateInput<T>
): Promise<GenerateOutput<T>> {
  if (!llmAvailable()) return { data: null, source: 'engine', reason: 'llm_off' }

  // Cache 4h por alvo (§5.3)
  const cached = await prisma.intelLlmCache.findUnique({
    where: {
      companyId_kind_vendorCode_targetKey: {
        companyId: input.companyId,
        kind: input.kind,
        vendorCode: input.vendorCode,
        targetKey: input.targetKey,
      },
    },
  })
  if (cached && cached.expiresAt > new Date()) {
    return { data: cached.payload as T, source: 'cache' }
  }

  // Cap diário de tokens por tenant (D13: 500k default)
  const used = await dailyTokensUsed(input.companyId)
  if (used >= env.INTEL_LLM_DAILY_TOKEN_CAP) {
    return { data: null, source: 'engine', reason: 'daily_cap' }
  }

  // Defesa em profundidade: nenhum fato fora da allowlist sai do servidor
  const leaks = validateFactsPayload(input.factsPayload)
  if (leaks.length > 0) {
    captureError(new Error('Fatos fora da allowlist'), {
      module: 'intel-agent',
      kind: input.kind,
      leaks: leaks.slice(0, 5),
    })
    return { data: null, source: 'engine', reason: 'facts_leak' }
  }

  // 1ª tentativa + 1 regeneração quando o self-check reprova (§5.2)
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let model: string | null
  let latencyMs = 0

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete<T>({
      system: input.system,
      user:
        attempt === 0
          ? input.userPrompt
          : `${input.userPrompt}\n\nATENÇÃO: a resposta anterior citou dados fora dos fatos. Use SOMENTE números e clientes presentes no JSON.`,
      schema: input.schema,
    })

    if (!result.ok) {
      return { data: null, source: 'engine', reason: result.error }
    }

    usage.inputTokens += result.usage.inputTokens
    usage.outputTokens += result.usage.outputTokens
    usage.cacheReadTokens += result.usage.cacheReadTokens
    model = result.model
    latencyMs += result.ms

    const check = selfCheck(input.extractText(result.data), input.selfCheckFacts)
    if (!check.ok) {
      if (attempt === 1) {
        return { data: null, source: 'engine', reason: `self_check: ${check.violations[0]}` }
      }
      continue
    }

    await prisma.intelLlmCache.upsert({
      where: {
        companyId_kind_vendorCode_targetKey: {
          companyId: input.companyId,
          kind: input.kind,
          vendorCode: input.vendorCode,
          targetKey: input.targetKey,
        },
      },
      create: {
        companyId: input.companyId,
        kind: input.kind,
        vendorCode: input.vendorCode,
        targetKey: input.targetKey,
        payload: result.data as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + CACHE_HOURS * 3_600_000),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        model,
        latencyMs,
      },
      update: {
        payload: result.data as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + CACHE_HOURS * 3_600_000),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        model,
        latencyMs,
        createdAt: new Date(), // renova a janela do cap diário
      },
    })

    return { data: result.data, source: 'llm' }
  }

  return { data: null, source: 'engine', reason: 'self_check' }
}
