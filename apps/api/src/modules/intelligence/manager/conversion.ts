// Conversão em reais por origem da visita (plano 004): quanto cada visita
// rendeu — "do plano" (planItemId !== null) × "fora do plano" — e se o motor
// acertou o tamanho do dia. Puro — sobre fatos já carregados, no mesmo
// estilo de pilot-metrics.ts e no-order.ts.
//
// Duas sutilezas que não são óbvias:
//  - `expectedAmount` é ticket médio × probabilidade de compra
//    (engine/ranking.ts), não previsão do tamanho de um pedido específico.
//    Comparar previsto × realizado por cliente é estatisticamente errado; a
//    conta só vale somada sobre muitas paradas — por isso `expected` só
//    existe aqui no agregado, nunca por cliente.
//  - Pedido com status CANCELLED conta como não convertido: quem monta o
//    `VisitValueFact` (conversion.service.ts) já traduz isso para
//    `orderTotal: null` antes de chamar esta função — aqui dentro, null
//    sempre significa "não entra na soma".

export interface VisitValueFact {
  ymd: string
  vendorCode: string
  planned: boolean // planItemId !== null
  orderTotal: number | null // null = não virou pedido (ou pedido cancelado)
  expectedAmount: number | null // do VisitPlanItem; null fora do plano
  link: 'strong' | 'byDate' | 'none' // como o pedido foi conciliado (passo 3)
}

export interface ConversionSlice {
  visits: number
  withOrder: number
  soldAmount: number
  avgTicket: number | null // soldAmount / withOrder; null com withOrder === 0
}

export interface ConversionReport {
  range: { fromYmd: string; toYmd: string }
  planned: ConversionSlice
  outOfPlan: ConversionSlice
  total: ConversionSlice
  /** soldAmount/visits do plano − soldAmount/visits fora do plano; null se algum lado tiver visits 0 */
  valuePerVisitDiff: number | null
  /** Transparência da conciliação (passo 3) — alimenta o rodapé da tela. */
  reconciliation: { strong: number; byDate: number }
  expected: {
    expectedAmount: number // Σ expectedAmount das paradas que viraram visita
    soldAmount: number // Σ total vendido nessas mesmas paradas
    ratioPct: number | null // null quando expectedAmount === 0
  }
}

export interface ConversionReportInput {
  fromYmd: string
  toYmd: string
  facts: VisitValueFact[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildSlice(facts: VisitValueFact[]): ConversionSlice {
  const withOrderFacts = facts.filter((f) => f.orderTotal !== null)
  const soldAmount = round2(withOrderFacts.reduce((sum, f) => sum + (f.orderTotal as number), 0))
  return {
    visits: facts.length,
    withOrder: withOrderFacts.length,
    soldAmount,
    avgTicket: withOrderFacts.length > 0 ? round2(soldAmount / withOrderFacts.length) : null,
  }
}

export function buildConversionReport(input: ConversionReportInput): ConversionReport {
  const plannedFacts = input.facts.filter((f) => f.planned)
  const outOfPlanFacts = input.facts.filter((f) => !f.planned)

  const planned = buildSlice(plannedFacts)
  const outOfPlan = buildSlice(outOfPlanFacts)
  const total = buildSlice(input.facts)

  const valuePerVisitDiff =
    planned.visits > 0 && outOfPlan.visits > 0
      ? round2(planned.soldAmount / planned.visits - outOfPlan.soldAmount / outOfPlan.visits)
      : null

  // Conta só quem de fato converteu (orderTotal !== null) — um pedido
  // CANCELLED achado por data não é "conciliado" para este rodapé, porque
  // não há venda nenhuma para atribuir ao método de vínculo.
  const converted = input.facts.filter((f) => f.orderTotal !== null)
  const reconciliation = {
    strong: converted.filter((f) => f.link === 'strong').length,
    byDate: converted.filter((f) => f.link === 'byDate').length,
  }

  // Paradas não visitadas nunca viram VisitValueFact (não há Visit para
  // elas) — então este filtro já respeita "só paradas que viraram visita".
  const expectedFacts = input.facts.filter((f) => f.expectedAmount !== null)
  const expectedAmount = round2(expectedFacts.reduce((sum, f) => sum + (f.expectedAmount as number), 0))
  const soldInExpected = round2(expectedFacts.reduce((sum, f) => sum + (f.orderTotal ?? 0), 0))
  const ratioPct = expectedAmount === 0 ? null : Math.round((soldInExpected / expectedAmount) * 100)

  return {
    range: { fromYmd: input.fromYmd, toYmd: input.toYmd },
    planned,
    outOfPlan,
    total,
    valuePerVisitDiff,
    reconciliation,
    expected: { expectedAmount, soldAmount: soldInExpected, ratioPct },
  }
}
