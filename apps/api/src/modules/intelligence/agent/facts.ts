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
])

// Padrões que denunciam dado pessoal vazando em VALOR de string
const FORBIDDEN_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, 'CNPJ'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, 'CPF'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'e-mail'],
  [/\b\d{5}-?\d{3}\b/, 'CEP'],
  [/\(\d{2}\)\s?\d{4,5}-?\d{4}/, 'telefone'],
]

/** Varre o payload serializado: chaves fora da allowlist e valores suspeitos. */
export function validateFactsPayload(payload: unknown): string[] {
  const violations: string[] = []
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!ALLOWED_FACT_KEYS.has(key)) {
          violations.push(`chave fora da allowlist: ${path}.${key}`)
        }
        walk(child, `${path}.${key}`)
      }
      return
    }
    if (typeof value === 'string') {
      for (const [pattern, label] of FORBIDDEN_VALUE_PATTERNS) {
        if (pattern.test(value)) violations.push(`valor com cara de ${label} em ${path}`)
      }
    }
  }
  walk(payload, '$')
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
