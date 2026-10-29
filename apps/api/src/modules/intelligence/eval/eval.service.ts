// Eval de regressão do agente (E6, doc §5.3): snapshots congelados e
// pseudonimizados rodam os prompts de briefing e de mensagem + self-check +
// expectativas do caso antes de qualquer mudança de prompt/modelo. Sem LLM
// disponível, o run marca SKIPPED.
//
// Plano 012: sem cache (o 2º run na janela de 4 h contava PASS sem chamar o
// modelo), a 1ª tentativa conta separado da regeneração, e o `expected`
// congelado é conferido de verdade.
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import { env } from '../../../lib/env'
import {
  EVAL_VENDOR_CODE,
  generateWithGuardrails,
  type GenerateOutput,
} from '../agent/agent.service'
import { llmAvailable } from '../agent/client'
import {
  buildCustomerFacts,
  customerNumbers,
  customerProducts,
  type CustomerFacts,
  type MessageFacts,
} from '../agent/facts'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { loadSnapshot } from '../agent/snapshot'
import { promptVersion, buildTenantContext, systemBlocks } from '../agent/tenant-context'
import {
  buildBriefingPrompt,
  BRIEFING_SCHEMA,
  type BriefingOutput,
} from '../agent/prompts/briefing'
import { buildMessagePrompt, MESSAGE_SCHEMA, type MessageOutput } from '../agent/prompts/message'
import { customerFacingViolations, type SelfCheckFacts } from '../agent/self-check'
import {
  briefingExpectationViolations,
  evalApproved,
  situationFor,
  type EvalExpected,
} from './expectations'
import { selectEvalCases } from './select-cases'

// 20 casos é o piso do piloto (E14a). O teto da busca existe só para não puxar
// a base inteira de um tenant grande — a escolha em si é estratificada.
const FREEZE_LIMIT = 20
const FREEZE_SCAN_LIMIT = 2000
// Mensagem vai para o cliente: 6 casos (2 por situação, quando a carteira deixa).
// Bloqueado fica de fora — a rota recusa a mensagem para ele (422).
const FREEZE_MESSAGE_LIMIT = 6

/** Congela casos a partir dos sinais atuais — snapshot JÁ pseudonimizado (D4). */
export async function freezeEvalCases(company: Company): Promise<number> {
  const candidates = await prisma.customerSignal.findMany({
    where: { companyId: company.id },
    orderBy: [{ status: 'asc' }, { customerCode: 'asc' }],
    take: FREEZE_SCAN_LIMIT,
  })
  const signals = selectEvalCases(
    candidates.map((signal) => ({
      ...signal,
      hasCutMix: Array.isArray(signal.cutMix) && signal.cutMix.length > 0,
    })),
    FREEZE_LIMIT
  )

  let created = 0
  let messages = 0
  for (const signal of signals) {
    const pseudonymizer = new Pseudonymizer()
    // Snapshot completo (títulos em aberto reais) — o montado à mão zerava os
    // títulos, e o caso BLOCKED congelava um cliente bloqueado que não devia nada
    const snapshot = await loadSnapshot(company.id, signal.customerCode, signal.loja)
    if (!snapshot) continue
    // Pseudonimiza ANTES de congelar: o snapshot não referencia o cliente real
    const facts = buildCustomerFacts(
      { customerCode: signal.customerCode, loja: signal.loja, city: null, snapshot },
      pseudonymizer
    )
    const base = { status: signal.status, hasCutMix: snapshot.cutMix.length > 0 }
    const cases: EvalExpected[] = [{ kind: 'briefing', ...base }]
    if (signal.status !== 'BLOCKED' && messages < FREEZE_MESSAGE_LIMIT) {
      cases.push({ kind: 'message', ...base, situation: situationFor(signal.status, messages) })
      messages++
    }
    for (const expected of cases) {
      await prisma.evalCase.create({
        data: {
          companyId: company.id,
          vendorCode: EVAL_VENDOR_CODE,
          frozenDate: new Date(),
          snapshot: facts as unknown as object,
          expected: expected as unknown as object,
          promptVersion: promptVersion(),
        },
      })
      created++
    }
  }
  return created
}

export interface EvalRunSummary {
  total: number
  /** passedFirst + passedRetry */
  passed: number
  /** Aprovados na 1ª chamada ao modelo */
  passedFirst: number
  /** Aprovados só na regeneração — passam, mas custam o dobro em produção */
  passedRetry: number
  failed: number
  skipped: number
  /** Falhas em casos BLOCKED — o critério de aprovação exige zero */
  blockedFailed: number
  approved: boolean
  promptVersion: string
  /**
   * Casos que não passaram de primeira, com cada resposta reprovada (texto
   * pseudonimizado — sem dado pessoal). É o que separa regra errada de modelo
   * errado; sem isso o eval dizia só "número fora dos fatos: 12".
   */
  notFirst: {
    kind: string
    status: string
    result: string
    rejected: { text: string; violations: string[] }[]
  }[]
}

function selfCheckFactsFor(facts: CustomerFacts): SelfCheckFacts {
  return {
    customers: [
      { pseudonym: facts.pseudonym, status: facts.status, numbers: customerNumbers(facts) },
    ],
    numbers: [],
    freshnessLine: null,
    products: customerProducts(facts),
  }
}

async function runCase(
  company: Company,
  system: ReturnType<typeof systemBlocks>,
  caseId: string,
  facts: CustomerFacts,
  expected: EvalExpected,
  model: string | undefined
): Promise<GenerateOutput<unknown>> {
  const common = {
    companyId: company.id,
    vendorCode: EVAL_VENDOR_CODE,
    targetKey: `eval:${caseId}`,
    system,
    selfCheckFacts: selfCheckFactsFor(facts),
    cache: false,
    model,
  }
  if (expected.kind === 'message') {
    const messageFacts: MessageFacts = {
      situation: expected.situation ?? 'WENT_QUIET',
      tone: 'informal',
      customers: [facts],
      lastOrderDays: facts.daysSinceLastPurchase,
      freshness: { lastSyncAt: null },
    }
    return generateWithGuardrails<MessageOutput>({
      ...common,
      kind: 'message',
      userPrompt: buildMessagePrompt(messageFacts),
      schema: MESSAGE_SCHEMA as unknown as Record<string, unknown>,
      factsPayload: messageFacts,
      extractText: (data) => data.text,
      validate: (data) => customerFacingViolations(data.text),
    })
  }
  return generateWithGuardrails<BriefingOutput>({
    ...common,
    kind: 'briefing',
    userPrompt: buildBriefingPrompt({ customers: [facts], freshness: { lastSyncAt: null } }),
    schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
    factsPayload: { customers: [facts] },
    extractText: (data) =>
      `${data.whatHappened}\n${data.whyItMatters}\n${data.whatToDo}\n${data.confidence}`,
    validate: (data) => briefingExpectationViolations(data, facts, expected),
  })
}

export interface RunEvalOptions {
  /** Modelo candidato (teste de custo); sem ele, o da empresa */
  model?: string
}

export async function runEval(
  company: Company,
  opts: RunEvalOptions = {}
): Promise<EvalRunSummary> {
  const cases = await prisma.evalCase.findMany({ where: { companyId: company.id } })
  const version = promptVersion()
  // O resultado por caso (lastResult) é o do modelo em uso: o teste de um
  // candidato reprovado não pode marcar o tenant como reprovado na prontidão
  const recordResults = !opts.model || opts.model === (company.llmModel ?? env.INTEL_LLM_MODEL)
  let passedFirst = 0
  let passedRetry = 0
  let failed = 0
  let skipped = 0
  let blockedFailed = 0
  const notFirst: EvalRunSummary['notFirst'] = []

  const tenantContext = await buildTenantContext(company)
  const system = systemBlocks(tenantContext)

  for (const evalCase of cases) {
    if (!llmAvailable()) {
      skipped++
      if (recordResults) {
        await prisma.evalCase.update({
          where: { id: evalCase.id },
          data: { lastResult: 'SKIPPED', ranAt: new Date(), promptVersion: version },
        })
      }
      continue
    }

    const facts = evalCase.snapshot as unknown as CustomerFacts
    const expected = evalCase.expected as unknown as EvalExpected
    const result = await runCase(company, system, evalCase.id, facts, expected, opts.model)

    let lastResult: string
    if (result.source === 'llm' && result.attempts === 1) {
      passedFirst++
      lastResult = 'PASS'
    } else if (result.source === 'llm') {
      passedRetry++
      lastResult = 'PASS_RETRY'
    } else {
      failed++
      if (expected.status === 'BLOCKED') blockedFailed++
      lastResult = `FAIL: ${result.reason ?? ''}`.slice(0, 100)
    }
    if (recordResults) {
      await prisma.evalCase.update({
        where: { id: evalCase.id },
        data: { lastResult, ranAt: new Date(), promptVersion: version },
      })
    }
    if (lastResult !== 'PASS') {
      notFirst.push({
        kind: expected.kind ?? 'briefing',
        status: expected.status,
        result: lastResult,
        rejected: result.rejected ?? [],
      })
    }
  }

  const counts = { total: cases.length, passedFirst, passedRetry, failed, skipped, blockedFailed }
  return {
    ...counts,
    passed: passedFirst + passedRetry,
    approved: evalApproved(counts),
    promptVersion: version,
    notFirst,
  }
}
