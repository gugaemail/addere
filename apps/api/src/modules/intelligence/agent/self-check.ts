// Self-check determinístico da resposta do LLM (E6, doc §5.2) — puro.
// Falhou → regenera 1×; falhou de novo → entrega só-motor (sem texto).

/** Prefixo do rodapé de frescor — o prompt exige, o self-check desconta. */
export const FRESHNESS_PREFIX = 'Dados sincronizados: '

/** Rodapé exatamente como o prompt do Hoje pede ao modelo (fonte única). */
export function freshnessLine(lastSyncAt: string | null): string {
  return `${FRESHNESS_PREFIX}${lastSyncAt ?? 'sem sincronização ainda'}`
}

export interface SelfCheckCustomer {
  pseudonym: string // C1, C2…
  status: string // CustomerStatus
}

export interface SelfCheckFacts {
  customers: SelfCheckCustomer[]
  /** Todos os números presentes nos fatos (valores, dias, ciclos, %…) */
  numbers: number[]
  /** Linha de frescor obrigatória no fim (null = não exigir) */
  freshnessLine: string | null
}

export interface SelfCheckResult {
  ok: boolean
  violations: string[]
}

const SALE_ACTION = /\b(vend[aeo]\w*|ofere[çc]\w*|prop[oô]\w*|fech[aeo]\w*|tirar pedido|novo pedido)\b/i
const CYCLE_CLAIM = /\bcompra a cada \d+ dias\b/i

/** Números do texto em formato BR ("1.234,56"), US ("1234.56"), inteiro ou %. */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = []
  // Remove pseudônimos para C12 não virar o número 12
  const clean = text.replace(/\bC\d+\b/g, ' ')
  const pattern = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g
  for (const match of clean.match(pattern) ?? []) {
    const normalized = match.includes(',')
      ? match.replace(/\./g, '').replace(',', '.')
      : match.includes('.') && /\.\d{3}(?!\d)/.test(match)
        ? match.replace(/\./g, '')
        : match
    const value = Number(normalized)
    if (Number.isFinite(value)) numbers.push(value)
  }
  return numbers
}

function numberMatches(cited: number, facts: number[]): boolean {
  return facts.some((fact) => {
    const tolerance = Math.max(1, Math.abs(fact) * 0.01) // arredondamento (§5.2)
    return Math.abs(cited - fact) <= tolerance
  })
}

function sentencesWith(text: string, pseudonym: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .filter((sentence) => new RegExp(`\\b${pseudonym}\\b`).test(sentence))
}

export function selfCheck(text: string, facts: SelfCheckFacts): SelfCheckResult {
  const violations: string[] = []
  const known = new Map(facts.customers.map((c) => [c.pseudonym, c]))

  // 1. Todo cliente citado existe nos fatos
  const cited = new Set(text.match(/\bC\d+\b/g) ?? [])
  for (const pseudonym of cited) {
    if (!known.has(pseudonym)) violations.push(`cliente inventado: ${pseudonym}`)
  }

  // 2. Todo número citado existe nos fatos (tolerância de arredondamento).
  // O rodapé de frescor sai da varredura SEMPRE, exigido ou não: "03:12"
  // viraria os números 3 e 12, e o skill manda terminar com ele. Foi isso
  // que deixou o Hoje em só-motor desde a v1 — o job passava freshnessLine
  // null enquanto o prompt exigia a linha, e "12" nunca estava nos fatos.
  const scannable = text.replace(new RegExp(`${FRESHNESS_PREFIX}[^\n]*`, 'g'), ' ')
  for (const cited of extractNumbers(scannable)) {
    if (!numberMatches(cited, facts.numbers)) {
      violations.push(`número fora dos fatos: ${cited}`)
    }
  }

  // 3. Bloqueado nunca recebe ação de venda
  for (const customer of facts.customers) {
    if (customer.status !== 'BLOCKED') continue
    for (const sentence of sentencesWith(text, customer.pseudonym)) {
      if (SALE_ACTION.test(sentence)) {
        violations.push(`ação de venda para bloqueado ${customer.pseudonym}`)
      }
    }
  }

  // 4. Cliente novo nunca com certeza de ciclo
  for (const customer of facts.customers) {
    if (customer.status !== 'NEW') continue
    for (const sentence of sentencesWith(text, customer.pseudonym)) {
      if (CYCLE_CLAIM.test(sentence)) {
        violations.push(`certeza de ciclo para cliente novo ${customer.pseudonym}`)
      }
    }
  }

  // 5. Rodapé de frescor presente
  if (facts.freshnessLine && !text.includes(facts.freshnessLine)) {
    violations.push('linha de frescor ausente')
  }

  return { ok: violations.length === 0, violations }
}
