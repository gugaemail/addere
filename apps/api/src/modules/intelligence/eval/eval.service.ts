// Eval de regressão do agente (E6, doc §5.3): snapshots congelados e
// pseudonimizados rodam o prompt de briefing + self-check antes de qualquer
// mudança de prompt/modelo. Sem LLM disponível, o run marca SKIPPED.
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import type { SignalsSnapshot } from '@addere/types'
import { generateWithGuardrails } from '../agent/agent.service'
import { llmAvailable } from '../agent/client'
import { buildCustomerFacts, type CustomerFacts } from '../agent/facts'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { promptVersion, buildTenantContext, systemBlocks } from '../agent/tenant-context'
import {
  buildBriefingPrompt,
  BRIEFING_SCHEMA,
  type BriefingOutput,
} from '../agent/prompts/briefing'
import type { SelfCheckFacts } from '../agent/self-check'
import { selectEvalCases } from './select-cases'

// 20 casos é o piso do piloto (E14a). O teto da busca existe só para não puxar
// a base inteira de um tenant grande — a escolha em si é estratificada.
const FREEZE_LIMIT = 20
const FREEZE_SCAN_LIMIT = 2000

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
  for (const signal of signals) {
    const pseudonymizer = new Pseudonymizer()
    const snapshot: SignalsSnapshot = {
      status: signal.status,
      confidence: signal.confidence,
      cycleDays: signal.cycleDays,
      daysSinceLastPurchase: signal.daysSinceLastPurchase,
      orders12m: signal.orders12m,
      avgTicket: signal.avgTicket?.toString() ?? null,
      trendPct: signal.trendPct === null ? null : Number(signal.trendPct),
      usualMix: (signal.usualMix ?? []) as SignalsSnapshot['usualMix'],
      cutMix: (signal.cutMix ?? []) as SignalsSnapshot['cutMix'],
      openTitles: { count: 0, totalBalance: '0.00', maxDaysOverdue: null },
      reasons: (signal.reasons ?? []) as string[],
    }
    // Pseudonimiza ANTES de congelar: o snapshot não referencia o cliente real
    const facts = buildCustomerFacts(
      { customerCode: signal.customerCode, loja: signal.loja, city: null, snapshot },
      pseudonymizer
    )
    await prisma.evalCase.create({
      data: {
        companyId: company.id,
        vendorCode: 'eval',
        frozenDate: new Date(),
        snapshot: facts as unknown as object,
        expected: { status: signal.status, hasCutMix: snapshot.cutMix.length > 0 },
        promptVersion: promptVersion(),
      },
    })
    created++
  }
  return created
}

export interface EvalRunSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  promptVersion: string
}

export async function runEval(company: Company): Promise<EvalRunSummary> {
  const cases = await prisma.evalCase.findMany({ where: { companyId: company.id } })
  const version = promptVersion()
  let passed = 0
  let failed = 0
  let skipped = 0

  const tenantContext = await buildTenantContext(company)
  const system = systemBlocks(tenantContext)

  for (const evalCase of cases) {
    if (!llmAvailable()) {
      skipped++
      await prisma.evalCase.update({
        where: { id: evalCase.id },
        data: { lastResult: 'SKIPPED', ranAt: new Date(), promptVersion: version },
      })
      continue
    }

    const facts = evalCase.snapshot as unknown as CustomerFacts
    const selfCheckFacts: SelfCheckFacts = {
      customers: [{ pseudonym: facts.pseudonym, status: facts.status }],
      numbers: [
        facts.cycleDays,
        facts.daysSinceLastPurchase,
        facts.orders12m,
        facts.avgTicket === null ? null : Number(facts.avgTicket),
        facts.trendPct,
        facts.openTitles.maxDaysOverdue,
        Number(facts.openTitles.totalBalance),
        facts.openTitles.count,
      ].filter((n): n is number => n !== null && Number.isFinite(n)),
      freshnessLine: null,
    }

    const result = await generateWithGuardrails<BriefingOutput>({
      companyId: company.id,
      kind: 'briefing',
      vendorCode: 'eval',
      targetKey: `eval:${evalCase.id}:${version}`,
      system,
      userPrompt: buildBriefingPrompt({ customers: [facts], freshness: { lastSyncAt: null } }),
      schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
      factsPayload: { customers: [facts] },
      selfCheckFacts,
      extractText: (data) =>
        `${data.whatHappened}\n${data.whyItMatters}\n${data.whatToDo}\n${data.confidence}`,
    })

    const ok = result.source === 'llm' || result.source === 'cache'
    if (ok) passed++
    else failed++
    await prisma.evalCase.update({
      where: { id: evalCase.id },
      data: {
        lastResult: ok ? 'PASS' : `FAIL: ${result.reason ?? ''}`.slice(0, 100),
        ranAt: new Date(),
        promptVersion: version,
      },
    })
  }

  return { total: cases.length, passed, failed, skipped, promptVersion: version }
}
