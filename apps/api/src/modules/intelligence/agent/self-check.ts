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
  /**
   * Números DESTE cliente. Quando informado, frase que cita só ele precisa
   * casar com eles (ou com os globais) — o número certo no cliente errado
   * passava, porque os números eram um saco único sem dono.
   */
  numbers?: number[]
}

export interface SelfCheckProduct {
  productCode: string
  productDesc: string | null
}

export interface SelfCheckFacts {
  customers: SelfCheckCustomer[]
  /** Números globais dos fatos (meta, contagens, totais) — e, sem `numbers` por cliente, todos */
  numbers: number[]
  /** Linha de frescor obrigatória no fim (null = não exigir) */
  freshnessLine: string | null
  /**
   * Produtos dos fatos (mix, cortado, cross-sell). Quando informado, código com
   * cara de código de produto fora da lista reprova, e código/descrição
   * conhecidos saem da varredura de números ("Café 500g" não cobra o 500).
   */
  products?: SelfCheckProduct[]
}

export interface SelfCheckResult {
  ok: boolean
  violations: string[]
}

/**
 * Regex de palavras com fronteira que entende acento. O `\\b` do JavaScript só
 * conhece [A-Za-z0-9_]: "promoções" não fecha a palavra depois do "ç", e o
 * termo escapava da regra.
 */
function words(pattern: string, flags = 'iu'): RegExp {
  return new RegExp(`(?<![\\p{L}\\d_])(?:${pattern})(?![\\p{L}\\d_])`, flags)
}

// Ação de venda — bloqueado nunca recebe. Cada termo tem caso no corpus
// (__tests__/self-check.corpus.test.ts): o que reprova e o que precisa passar.
const SALE_ACTION_TERMS = words(
  [
    'vend[aeo]\\p{L}*',
    'ofere[çc]\\p{L}*',
    'prop[oô]\\p{L}*',
    'fech[aeo]\\p{L}*',
    'tirar pedido',
    'novo pedido',
    'rep[oô]r',
    'repon\\p{L}*',
    'reposi[çc][aã]o',
    'lan[çc]amentos?',
    'promo[çc]\\p{L}*',
    'novidades?',
    'montar (?:o |um )?pedido',
    'fazer (?:o |um )?pedido',
  ].join('|')
)
const SALE_ACTION_ALL = new RegExp(SALE_ACTION_TERMS.source, 'giu')

// Negação no mesmo trecho da frase desarma o termo: "Não ofereça nada", "sem
// oferecer produto", "não dá pra avançar em vendas" é o modelo fazendo o certo
// com o bloqueado — no eval de 14/10 era o único motivo das reprovações dele.
// "Não deixe de oferecer" é ordem de venda: dupla negação não desarma.
const NEGATION = words(
  'n[ãa]o|nunca|nem|sem|nada de|nenhum\\p{L}*|evit\\p{L}*|antes de|at[ée] (?:resolver|regularizar|quitar)'
)
const DOUBLE_NEGATION = words('n[ãa]o (?:deix\\p{L}* de|esque[çc]\\p{L}* de|perca)')
const CLAUSE_BREAKS = ['.', ',', ';', ':', '!', '?', '\n', '/', '—', '–']

/** Ação de venda afirmativa no texto — ignora a que está sob negação no mesmo trecho. */
export function hasSaleAction(text: string): boolean {
  for (const match of text.matchAll(SALE_ACTION_ALL)) {
    const before = text.slice(0, match.index)
    const breakAt = Math.max(...CLAUSE_BREAKS.map((c) => before.lastIndexOf(c)))
    const clause = before.slice(breakAt + 1)
    if (NEGATION.test(clause) && !DOUBLE_NEGATION.test(clause)) continue
    return true
  }
  return false
}
// Certeza de ciclo — cliente novo nunca recebe (histórico curto)
const CYCLE_CLAIM = words(
  [
    'compra a cada \\d+ dias',
    'ciclo de \\d+ dias',
    'costuma comprar',
    'sempre compra',
    'todo m[eê]s',
    'toda semana',
    'rep[oõ]e a cada',
  ].join('|')
)
// Janela fixa do fato orders12m ("nos últimos 12 meses"). "Há 12 meses" continua
// cobrado: aí o 12 é uma afirmação sobre o cliente, não o nome do fato.
const WINDOW_PHRASE = words('(?:n[oa]s|em|d[oa]s)\\s+(?:[uú]ltimos\\s+)?12\\s+meses', 'giu')
// Pseudônimo em caixa baixa ("c1") escapa da reidratação e chega cru na tela
const MALFORMED_PSEUDONYM = /\bc\d+\b/g

// Números por extenso que o modelo usa no lugar do algarismo ("três clientes").
// "um/uma" ficam de fora (artigo); "cem/mil" também ("2 mil" = 2000, não 2 e
// 1000). Só conta quando a palavra seguinte é minúscula: "Três Corações",
// "Sete Lagoas" e "Dois Vizinhos" são cidade, não número.
const NUMBER_WORDS: Record<string, number> = {
  dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
}
const NUMBER_WORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\d_])(${Object.keys(NUMBER_WORDS)
    .flatMap((w) => [w, w[0].toUpperCase() + w.slice(1)])
    .join('|')})(?=\\s+\\p{Ll})`,
  'gu'
)

// Token com cara de código de produto (Protheus: "PA0001", "MP-00123"): letra e
// pelo menos 3 dígitos, 5+ caracteres. Unidade ("500ML", "10KG") não é código.
const PRODUCT_CODE_LIKE = /\b(?=[A-Z0-9-]*[A-Z])(?=(?:[A-Z-]*\d){3})[A-Z0-9-]{5,}\b/g
const UNIT_LIKE = /^\d+(?:KG|G|GR|ML|L|LT|UN|CX|PC|PCT|M|MM|CM)$/
const PSEUDONYM_LIKE = /^C\d+$/

// Status do motor e segmentos RFM: rótulo interno, nunca vai para o cliente
const INTERNAL_LABELS = words(
  'ON_CYCLE|LATE|AT_RISK|INACTIVE|BLOCKED|NEW|CHAMPION|LOYAL|PROMISING|NEED_ATTENTION|HIBERNATING|LOST',
  'u'
)
const INTERNAL_TERMS = words(
  'rfm|pseud[oô]nimos?|ticket m[ée]dio|segmentos?|bloquead\\p{L}*|inadimpl\\p{L}*|vencid\\p{L}*|t[íi]tulos?'
)
export const MESSAGE_MAX_CHARS = 400
export const HOME_LINE_MAX_CHARS = 140

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
  for (const match of clean.matchAll(NUMBER_WORD_PATTERN)) {
    numbers.push(NUMBER_WORDS[match[1].toLowerCase()])
  }
  return numbers
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function numberMatches(cited: number, facts: number[]): boolean {
  return facts.some((fact) => {
    const tolerance = Math.max(1, Math.abs(fact) * 0.01) // arredondamento (§5.2)
    return Math.abs(cited - fact) <= tolerance
  })
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])\s+/)
}

function sentencesWith(text: string, pseudonym: string): string[] {
  return splitSentences(text).filter((sentence) =>
    new RegExp(`\\b${pseudonym}\\b`).test(sentence)
  )
}

export function selfCheck(text: string, facts: SelfCheckFacts): SelfCheckResult {
  const violations: string[] = []
  const known = new Map(facts.customers.map((c) => [c.pseudonym, c]))

  // 1. Todo cliente citado existe nos fatos — e escrito do jeito que o app reidrata
  const cited = new Set(text.match(/\bC\d+\b/g) ?? [])
  for (const pseudonym of cited) {
    if (!known.has(pseudonym)) violations.push(`cliente inventado: ${pseudonym}`)
  }
  for (const malformed of new Set(text.match(MALFORMED_PSEUDONYM) ?? [])) {
    violations.push(`pseudônimo malformado: ${malformed}`)
  }

  // O rodapé de frescor sai da varredura SEMPRE, exigido ou não: "03:12"
  // viraria os números 3 e 12, e o skill manda terminar com ele. Foi isso
  // que deixou o Hoje em só-motor desde a v1 — o job passava freshnessLine
  // null enquanto o prompt exigia a linha, e "12" nunca estava nos fatos.
  let scannable = text
    .replace(new RegExp(`${FRESHNESS_PREFIX}[^\n]*`, 'g'), ' ')
    // A janela do orders12m faz parte do nome do fato: "10 pedidos nos últimos
    // 12 meses". O 12 não está nos números e derrubava o briefing de quem cita
    // a frequência — no eval de 14/10, 9 das 21 reprovações eram isso.
    .replace(WINDOW_PHRASE, ' ')

  // 2. Produtos: código desconhecido reprova; os conhecidos (e as descrições,
  // que trazem gramatura) saem da varredura de números
  if (facts.products) {
    const literals = facts.products
      .flatMap((p) => [p.productDesc?.trim() ?? '', p.productCode.trim()])
      .filter((literal) => literal.length > 0)
      .sort((a, b) => b.length - a.length) // descrição longa antes do código contido nela
    for (const literal of literals) {
      scannable = scannable.replace(new RegExp(escapeRegExp(literal), 'gi'), ' ')
    }
    // O que sobrou com cara de código não está nos fatos
    for (const code of new Set(scannable.match(PRODUCT_CODE_LIKE) ?? [])) {
      if (UNIT_LIKE.test(code) || PSEUDONYM_LIKE.test(code)) continue
      violations.push(`produto fora dos fatos: ${code}`)
    }
  }

  // 3. Todo número citado existe nos fatos (tolerância de arredondamento)…
  const allNumbers = [...facts.numbers, ...facts.customers.flatMap((c) => c.numbers ?? [])]
  for (const value of extractNumbers(scannable)) {
    if (!numberMatches(value, allNumbers)) {
      violations.push(`número fora dos fatos: ${value}`)
    }
  }

  // …e, na frase que cita UM cliente só, pertence a ele ou aos globais
  for (const sentence of splitSentences(scannable)) {
    const inSentence = new Set(sentence.match(/\bC\d+\b/g) ?? [])
    if (inSentence.size !== 1) continue
    const customer = known.get([...inSentence][0])
    if (!customer?.numbers) continue
    const allowed = [...customer.numbers, ...facts.numbers]
    for (const value of extractNumbers(sentence)) {
      if (numberMatches(value, allNumbers) && !numberMatches(value, allowed)) {
        violations.push(`número de outro cliente em ${customer.pseudonym}: ${value}`)
      }
    }
  }

  // Com um cliente só nos fatos, "ele" é ele: a regra vale para o texto inteiro
  // (fecha o furo do pronome — "Ele está bloqueado. Ofereça a linha nova.")
  const single = facts.customers.length === 1
  const aboutCustomer = (pseudonym: string): string[] =>
    single ? [text] : sentencesWith(text, pseudonym)

  // 4. Bloqueado nunca recebe ação de venda
  for (const customer of facts.customers) {
    if (customer.status !== 'BLOCKED') continue
    for (const sentence of aboutCustomer(customer.pseudonym)) {
      if (hasSaleAction(sentence)) {
        violations.push(`ação de venda para bloqueado ${customer.pseudonym}`)
        break
      }
    }
  }

  // 5. Cliente novo nunca com certeza de ciclo
  for (const customer of facts.customers) {
    if (customer.status !== 'NEW') continue
    for (const sentence of aboutCustomer(customer.pseudonym)) {
      if (CYCLE_CLAIM.test(sentence)) {
        violations.push(`certeza de ciclo para cliente novo ${customer.pseudonym}`)
        break
      }
    }
  }

  // 6. Rodapé de frescor presente
  if (facts.freshnessLine && !text.includes(facts.freshnessLine)) {
    violations.push('linha de frescor ausente')
  }

  return { ok: violations.length === 0, violations }
}

/**
 * Regras do texto que vai PARA O CLIENTE (mensagem de WhatsApp): tamanho,
 * pergunta no fim e nenhum rótulo interno (status, RFM, "ticket médio",
 * título vencido…). O vendedor pode editar antes de enviar, mas o rascunho
 * precisa sair pronto para mandar.
 */
export function customerFacingViolations(text: string): string[] {
  const violations: string[] = []
  const trimmed = text.trim()
  if (trimmed.length > MESSAGE_MAX_CHARS) {
    violations.push(`mensagem com mais de ${MESSAGE_MAX_CHARS} caracteres`)
  }
  if (!/\?[\s\p{Extended_Pictographic}\u{FE0F}]*$/u.test(trimmed)) {
    violations.push('mensagem sem pergunta no fim')
  }
  const label = trimmed.match(INTERNAL_LABELS)
  if (label) violations.push(`rótulo interno na mensagem: ${label[0]}`)
  const term = trimmed.match(INTERNAL_TERMS)
  if (term) violations.push(`termo interno na mensagem: ${term[0].toLowerCase()}`)
  return violations
}
