// O que cada caso congelado do eval espera da resposta, além do self-check
// (plano 012) — puro. O `expected` era gravado no freeze e nunca lido: o caso
// BLOCKED passava desde que não citasse número errado, mesmo sem dizer uma
// palavra sobre a pendência.
import type { CustomerFacts } from '../agent/facts'
import type { BriefingOutput } from '../agent/prompts/briefing'
import type { MessageFacts } from '../agent/facts'

export type EvalKind = 'briefing' | 'message'

export interface EvalExpected {
  /** Ausente nos casos congelados antes do plano 012 — eram todos briefing */
  kind?: EvalKind
  status: string
  hasCutMix: boolean
  situation?: MessageFacts['situation']
}

const PENDENCY = /pend[êe]ncia|t[íi]tulo|financeir|cadastro|limite|cobran[çc]a|d[ée]bito/i
const HIGH_CONFIDENCE = /(?<![\p{L}])alta(?![\p{L}])/iu

/** Violações de expectativa do briefing — vazio = passou. */
export function briefingExpectationViolations(
  output: BriefingOutput,
  facts: CustomerFacts,
  expected: EvalExpected
): string[] {
  const violations: string[] = []
  if (expected.status === 'BLOCKED' && !PENDENCY.test(output.whatToDo)) {
    violations.push('bloqueado sem orientação de resolver a pendência')
  }
  if (expected.hasCutMix) {
    const action = `${output.whatHappened}\n${output.whatToDo}`.toLowerCase()
    const mentions = facts.cutMix.some(
      (p) =>
        action.includes(p.productCode.trim().toLowerCase()) ||
        (p.productDesc !== null && action.includes(p.productDesc.trim().toLowerCase()))
    )
    if (!mentions) violations.push('mix cortado não citado')
  }
  if (expected.status === 'NEW' && HIGH_CONFIDENCE.test(output.confidence)) {
    violations.push('confiança alta para cliente novo')
  }
  return violations
}

/** Situação da mensagem por status — a que faz sentido para o caso congelado. */
export function situationFor(status: string, index: number): MessageFacts['situation'] {
  if (status === 'INACTIVE') return 'REACTIVATE'
  if (status === 'LATE' || status === 'AT_RISK') return 'WENT_QUIET'
  const rotation: MessageFacts['situation'][] = ['STALLED_PROPOSAL', 'WENT_QUIET', 'REACTIVATE']
  return rotation[index % rotation.length]
}

export interface EvalSummaryCounts {
  total: number
  passedFirst: number
  passedRetry: number
  failed: number
  skipped: number
  blockedFailed: number
}

/** Piso de aprovação na 1ª tentativa — regeneração custa o dobro em produção. */
export const FIRST_ATTEMPT_MIN_PCT = 90

/**
 * Critério de aprovação (docs/intelligence/README.md): zero falha em caso
 * BLOCKED e ≥ 90 % de aprovação de primeira entre os casos que rodaram.
 * Tudo SKIPPED não aprova — não testou nada.
 */
export function evalApproved(summary: EvalSummaryCounts): boolean {
  const ran = summary.total - summary.skipped
  if (ran === 0) return false
  return summary.blockedFailed === 0 && (summary.passedFirst / ran) * 100 >= FIRST_ATTEMPT_MIN_PCT
}
