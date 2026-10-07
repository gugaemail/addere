// "Por que não vendeu" (E22, plano 002): agrupa o texto livre que o vendedor
// digita em Visit.noOrderReason quando o resultado é NO_ORDER. Puro — sobre
// fatos já carregados, no mesmo estilo de team.ts e pilot-metrics.ts.
//
// A normalização é propositalmente burra (minúsculas, espaços colapsados,
// pontuação final removida). Não tenta corrigir ortografia nem fundir
// sinônimos: agrupamento esperto que erra é pior que agrupamento burro que
// acerta. Qualquer evolução dela precisa de teste antes, porque muda
// contagem histórica sem avisar ninguém.

export interface NoOrderFact {
  ymd: string
  vendorCode: string
  sellerName: string
  customerName: string
  reason: string // texto como digitado
  planned: boolean // planItemId !== null
}

export interface ReasonBucket {
  normalized: string // chave do agrupamento
  sample: string // primeiro texto original do grupo, para exibir
  count: number
}

export interface NoOrderReport {
  total: number
  buckets: ReasonBucket[] // só os com count >= 2, ordem decrescente
  singletons: number // quantos motivos apareceram uma vez só
  recent: NoOrderFact[] // até 10, mais recentes primeiro
}

const MAX_RECENT = 10

/**
 * trim → minúsculas → espaços internos colapsados → pontuação final
 * (`.`, `,`, `;`, `!`) removida. Nada além disso.
 */
function normalize(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;!]+\s*$/, '')
    .trim()
}

export function buildNoOrderReport(facts: NoOrderFact[]): NoOrderReport {
  const groups = new Map<string, { sample: string; count: number }>()
  for (const fact of facts) {
    const key = normalize(fact.reason)
    const group = groups.get(key)
    if (group) group.count++
    else groups.set(key, { sample: fact.reason, count: 1 })
  }

  const buckets: ReasonBucket[] = []
  let singletons = 0
  for (const [normalized, group] of groups) {
    if (group.count >= 2) {
      buckets.push({ normalized, sample: group.sample, count: group.count })
    } else {
      singletons++
    }
  }
  // Empates de count desempatam por normalized em ordem alfabética, para a
  // saída ser determinística.
  buckets.sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized))

  const recent = [...facts].sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0)).slice(0, MAX_RECENT)

  return { total: facts.length, buckets, singletons, recent }
}
