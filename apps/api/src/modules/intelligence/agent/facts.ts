// Builder de fatos para o LLM (E6, D13): SÓ o que está na allowlist sai daqui.
// Nome, CNPJ, telefone, endereço, CEP e e-mail NUNCA entram — o cliente vira
// pseudônimo (C1, C2…) e o texto volta reidratado depois do self-check.
import type { SignalsSnapshot } from '@addere/types'
import { Pseudonymizer } from './pseudonymizer'

// Chaves permitidas em qualquer payload de fatos (teste falha fora disso)
export const ALLOWED_FACT_KEYS = new Set([
  // envelope
  'customers', 'goal', 'plan', 'freshness', 'situation', 'tone', 'grouping', 'date',
  // cliente (pseudonimizado)
  'pseudonym', 'status', 'cycleDays', 'daysSinceLastPurchase', 'orders12m',
  'avgTicket', 'trendPct', 'usualMix', 'cutMix', 'openTitles', 'reasons', 'city',
  // mix / títulos
  'productCode', 'productDesc', 'count', 'totalBalance', 'maxDaysOverdue',
  // meta (§4.2)
  'goalAmount', 'soldAmount', 'gap', 'perBusinessDay', 'lateCoverage',
  // plano
  'position', 'shortReason', 'expectedAmount',
  // frescor / mensagem
  'lastSyncAt', 'template', 'lastOrderDays',
  // fase 2 — carteira (E19), semana (E18) e perdas (E21)
  'counts', 'days', 'rfmSegment', 'crossSell', 'peersPct',
  'totals', 'baselineAmount', 'currentAmount', 'diffAmount', 'diffPct', 'components', 'products',
])

// Padrões que denunciam dado pessoal vazando em VALOR de string
const FORBIDDEN_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, 'CNPJ'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'CPF'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'e-mail'],
  [/\b\d{5}-?\d{3}\b/, 'CEP'],
  [/\(\d{2}\)\s?\d{4,5}-?\d{4}/, 'telefone'],
]

/**
 * Campos cujo valor é identificador ou data, não texto livre. Os padrões acima
 * não se aplicam a eles.
 *
 * Sem essa exceção o guardrail deixa de ser rede e vira interruptor: a data do
 * plano sai como `20260930` e o padrão de CEP (`\d{5}-?\d{3}`) casa com
 * qualquer número de 8 dígitos, então TODO payload era reprovado e o agente
 * nunca chegava a ser chamado. Aconteceu em produção entre 25 e 30/09/2026 —
 * cinco dias com zero chamadas ao modelo, sem nada na tela indicando isso.
 * Código de produto do Protheus com 8 ou 14 dígitos cairia na mesma armadilha.
 *
 * A força do guardrail não muda onde importa: a allowlist de chaves continua
 * impedindo que cpf, cnpj, cep ou telefone existam como campo, e os padrões
 * seguem valendo integralmente em texto livre (`reasons`, `shortReason`,
 * `productDesc`), que é por onde um dado pessoal realmente vazaria.
 */
const CODE_LIKE_KEYS = new Set(['date', 'lastSyncAt', 'productCode', 'pseudonym'])

/** Varre o payload serializado: chaves fora da allowlist e valores suspeitos. */
export function validateFactsPayload(payload: unknown): string[] {
  const violations: string[] = []
  const walk = (value: unknown, path: string, key: string | null) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`, key))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) {
        if (!ALLOWED_FACT_KEYS.has(childKey)) {
          violations.push(`chave fora da allowlist: ${path}.${childKey}`)
        }
        walk(child, `${path}.${childKey}`, childKey)
      }
      return
    }
    if (typeof value === 'string') {
      if (key !== null && CODE_LIKE_KEYS.has(key)) return
      for (const [pattern, label] of FORBIDDEN_VALUE_PATTERNS) {
        if (pattern.test(value)) violations.push(`valor com cara de ${label} em ${path}`)
      }
    }
  }
  walk(payload, '$', null)
  return violations
}

// ─── Builders ───

export interface CustomerFactsInput {
  customerCode: string
  loja: string
  city: string | null
  snapshot: SignalsSnapshot
}

export interface CustomerFacts {
  pseudonym: string
  status: string
  cycleDays: number | null
  daysSinceLastPurchase: number | null
  orders12m: number
  avgTicket: string | null
  trendPct: number | null
  usualMix: { productCode: string; productDesc: string | null }[]
  cutMix: { productCode: string; productDesc: string | null }[]
  openTitles: { count: number; totalBalance: string; maxDaysOverdue: number | null }
  reasons: string[]
  city: string | null
  rfmSegment?: string
  crossSell?: { productCode: string; productDesc: string | null; peersPct: number }[]
}

export function buildCustomerFacts(
  input: CustomerFactsInput,
  pseudonymizer: Pseudonymizer
): CustomerFacts {
  const snapshot = input.snapshot
  return {
    pseudonym: pseudonymizer.code(`${input.customerCode}|${input.loja}`),
    status: snapshot.status,
    cycleDays: snapshot.cycleDays,
    daysSinceLastPurchase: snapshot.daysSinceLastPurchase,
    orders12m: snapshot.orders12m,
    avgTicket: snapshot.avgTicket,
    trendPct: snapshot.trendPct,
    usualMix: snapshot.usualMix.map((p) => ({ productCode: p.productCode, productDesc: p.productDesc })),
    cutMix: snapshot.cutMix.map((p) => ({ productCode: p.productCode, productDesc: p.productDesc })),
    openTitles: snapshot.openTitles,
    reasons: snapshot.reasons,
    city: input.city,
    ...(snapshot.rfmSegment ? { rfmSegment: snapshot.rfmSegment } : {}),
    ...(snapshot.crossSell && snapshot.crossSell.length > 0
      ? {
          crossSell: snapshot.crossSell.map((p) => ({
            productCode: p.productCode,
            productDesc: p.productDesc,
            peersPct: p.peersPct,
          })),
        }
      : {}),
  }
}

export interface GoalFacts {
  goalAmount: string | null
  soldAmount: string | null
  gap: string | null
  perBusinessDay: string | null
  lateCoverage: string | null
}

export interface TodayFacts {
  date: string
  grouping: string | null
  goal: GoalFacts | null
  plan: {
    position: number
    pseudonym: string
    status: string
    shortReason: string | null
    expectedAmount: string | null
  }[]
  freshness: { lastSyncAt: string | null }
}

export interface MessageFacts {
  situation: 'STALLED_PROPOSAL' | 'WENT_QUIET' | 'REACTIVATE'
  tone: 'informal' | 'formal'
  customers: CustomerFacts[]
  lastOrderDays: number | null
  freshness: { lastSyncAt: string | null }
}
