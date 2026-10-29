// Serviço do agente (E6): cache 4h por (companyId, kind, vendorCode, targetKey),
// teto diário de tokens por vendedor e orçamento mensal da empresa (limits.ts),
// allowlist de fatos como defesa em profundidade e self-check com 1
// regeneração — falhou tudo, entrega só-motor. Toda saída grava uma linha em
// intel_llm_calls (plano 012): é o que alimenta o teto diário, o orçamento, o
// custo do mês e o alarme de queda para só-motor.
import { createHash } from 'node:crypto'
import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { captureError } from '../../../lib/sentry'
import { complete, llmAvailable, type LlmUsage } from './client'
import { validateFactsPayload } from './facts'
import { companyLlmSettings, monthlyBudgetPct, vendorDailyCap, vendorTokensToday } from './limits'
import { selfCheck, type SelfCheckFacts } from './self-check'
import { premiseNumbers, promptVersion } from './tenant-context'

const CACHE_HOURS = 4

export type AgentKind = 'today' | 'briefing' | 'message' | 'week' | 'portfolio' | 'losses'

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
  /** false = não lê nem grava o cache de texto (eval: toda rodada chama o modelo) */
  cache?: boolean
  /** Regras do tipo de texto além do self-check (tamanho da homeLine, mensagem ao cliente) */
  validate?: (data: T) => string[]
  /** Só o eval: testa outro modelo sem trocar o da empresa */
  model?: string
}

export interface GenerateOutput<T> {
  data: T | null
  source: 'llm' | 'cache' | 'engine'
  reason?: string // presente quando source='engine'
  /** Chamadas feitas ao modelo nesta geração: 0 (cache/bloqueio), 1 ou 2 */
  attempts: number
  /**
   * Respostas reprovadas pelo self-check, na ordem das tentativas (texto ainda
   * pseudonimizado). Só o eval lê — é o que diz se a regra errou ou o modelo.
   */
  rejected?: { text: string; violations: string[] }[]
}

/** Vendedor fictício dos casos de eval — não consome teto nem é barrado pelo orçamento. */
export const EVAL_VENDOR_CODE = 'eval'

/**
 * Hash de tudo o que o modelo recebe. Entra na chave do cache porque o texto
 * guardado tem pseudônimos (C1, C2…) atribuídos na ordem dos fatos daquela
 * requisição: com a chave só pelo alvo, um REFRESH que reordenasse a carteira
 * fazia o texto velho ser reidratado com o mapa novo — o número de um cliente
 * aparecia com o nome de outro —, e o gerente que pedia perdas sem filtro
 * recebia o texto escrito para a equipe de outro gerente (chave '*').
 */
export function inputHash(
  input: {
    system: GenerateInput<unknown>['system']
    userPrompt: string
    schema: Record<string, unknown>
  },
  model: string
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        model,
        system: input.system.map((block) => block.text),
        user: input.userPrompt,
        schema: input.schema,
      })
    )
    .digest('hex')
    .slice(0, 16)
}

/** Motivo sem números (cardinalidade baixa no registro e no painel). */
export function normalizeReason(reason: string | undefined): string | null {
  if (!reason) return null
  return reason.replace(/\d+(?:[.,]\d+)?/g, 'N').slice(0, 120)
}

interface CallRecord {
  source: GenerateOutput<unknown>['source']
  reason?: string
  attempts: number
  usage: LlmUsage
  model: string | null
  latencyMs: number
}

/** Registro nunca derruba a geração — falhou, vai para o Sentry e segue. */
async function recordCall(input: GenerateInput<unknown>, call: CallRecord): Promise<void> {
  try {
    await prisma.intelLlmCall.create({
      data: {
        companyId: input.companyId,
        kind: input.kind,
        vendorCode: input.vendorCode,
        source: call.source,
        reason: normalizeReason(call.reason),
        attempts: call.attempts,
        inputTokens: call.usage.inputTokens,
        outputTokens: call.usage.outputTokens,
        cacheReadTokens: call.usage.cacheReadTokens,
        cacheCreationTokens: call.usage.cacheCreationTokens,
        model: call.model,
        latencyMs: call.attempts > 0 ? call.latencyMs : null,
        promptVersion: promptVersion(),
      },
    })
  } catch (err) {
    captureError(err, { module: 'intel-agent', step: 'record-call', kind: input.kind })
  }
}

export async function generateWithGuardrails<T>(
  input: GenerateInput<T>
): Promise<GenerateOutput<T>> {
  if (!llmAvailable()) return { data: null, source: 'engine', reason: 'llm_off', attempts: 0 }

  const usage: LlmUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
  let model: string | null = null
  let latencyMs = 0
  let attempts = 0
  const rejected: { text: string; violations: string[] }[] = []

  const finish = async (out: Omit<GenerateOutput<T>, 'attempts'>): Promise<GenerateOutput<T>> => {
    const result = { ...out, attempts, ...(rejected.length > 0 ? { rejected } : {}) }
    await recordCall(input as GenerateInput<unknown>, {
      source: result.source,
      reason: result.reason,
      attempts,
      usage,
      model,
      latencyMs,
    })
    return result
  }

  // Modelo da empresa (ou o do eval) e orçamento do mês
  const settings = await companyLlmSettings(input.companyId)
  const llmModel = input.model ?? settings.model

  // Cache 4h por alvo E pela entrada exata (§5.3) — ver inputHash
  const useCache = input.cache !== false
  const cacheKey = {
    companyId: input.companyId,
    kind: input.kind,
    vendorCode: input.vendorCode,
    targetKey: `${input.targetKey}#${inputHash(input, llmModel)}`,
  }
  if (useCache) {
    const cached = await prisma.intelLlmCache.findUnique({
      where: { companyId_kind_vendorCode_targetKey: cacheKey },
    })
    if (cached && cached.expiresAt > new Date()) {
      return finish({ data: cached.payload as T, source: 'cache' })
    }
  }

  // Limites de custo — o eval não entra. Teto do vendedor primeiro: é o que
  // zera amanhã; o orçamento só volta no mês seguinte
  if (input.vendorCode !== EVAL_VENDOR_CODE) {
    const [used, cap] = await Promise.all([
      vendorTokensToday(input.companyId, input.vendorCode),
      vendorDailyCap(input.companyId, input.vendorCode),
    ])
    if (used >= cap) {
      return finish({ data: null, source: 'engine', reason: 'daily_cap' })
    }
    const budgetPct = await monthlyBudgetPct(input.companyId, settings.budget)
    if (budgetPct !== null && budgetPct >= 100) {
      return finish({ data: null, source: 'engine', reason: 'monthly_budget' })
    }
  }

  // Defesa em profundidade: nenhum fato fora da allowlist sai do servidor
  const leaks = validateFactsPayload(input.factsPayload)
  if (leaks.length > 0) {
    captureError(new Error('Fatos fora da allowlist'), {
      module: 'intel-agent',
      kind: input.kind,
      leaks: leaks.slice(0, 5),
    })
    return finish({ data: null, source: 'engine', reason: 'facts_leak' })
  }

  // Premissas do motor que o DADOS.md entrega ao modelo também são fatos
  const selfCheckFacts = {
    ...input.selfCheckFacts,
    numbers: [...input.selfCheckFacts.numbers, ...premiseNumbers(input.system.map((b) => b.text))],
  }

  // 1ª tentativa + 1 regeneração quando o self-check reprova (§5.2)
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await complete<T>({
      system: input.system,
      user:
        attempt === 0
          ? input.userPrompt
          : `${input.userPrompt}\n\nATENÇÃO: a resposta anterior citou dados fora dos fatos. Use SOMENTE números e clientes presentes no JSON.`,
      schema: input.schema,
      model: llmModel,
    })
    attempts++

    if (!result.ok) {
      // Resposta descartada (truncada, fora do schema…) também foi cobrada
      if (result.usage) {
        usage.inputTokens += result.usage.inputTokens
        usage.outputTokens += result.usage.outputTokens
        usage.cacheReadTokens += result.usage.cacheReadTokens
        usage.cacheCreationTokens += result.usage.cacheCreationTokens
      }
      model = result.model ?? model
      latencyMs += result.ms ?? 0
      return finish({ data: null, source: 'engine', reason: result.error })
    }

    usage.inputTokens += result.usage.inputTokens
    usage.outputTokens += result.usage.outputTokens
    usage.cacheReadTokens += result.usage.cacheReadTokens
    usage.cacheCreationTokens += result.usage.cacheCreationTokens
    model = result.model
    latencyMs += result.ms

    const text = input.extractText(result.data)
    const check = selfCheck(text, selfCheckFacts)
    const violations = [...check.violations, ...(input.validate?.(result.data) ?? [])]
    if (violations.length > 0) {
      rejected.push({ text, violations })
      if (attempt === 1) {
        return finish({ data: null, source: 'engine', reason: `self_check: ${violations[0]}` })
      }
      continue
    }

    if (useCache) {
      await prisma.intelLlmCache.upsert({
        where: { companyId_kind_vendorCode_targetKey: cacheKey },
        create: {
          ...cacheKey,
          payload: result.data as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + CACHE_HOURS * 3_600_000),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          model,
          latencyMs,
        },
        update: {
          payload: result.data as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + CACHE_HOURS * 3_600_000),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          model,
          latencyMs,
          createdAt: new Date(),
        },
      })
    }

    return finish({ data: result.data, source: 'llm' })
  }

  return finish({ data: null, source: 'engine', reason: 'self_check' })
}
