// "Onde estou perdendo" (E21, W2) — decomposição da variação de receita, pura.
// Compara o período atual com a média mensal dos N meses anteriores (base),
// normalizada para o tamanho do período atual, e atribui a diferença a:
// clientes que pararam, clientes comprando menos, produtos em queda e ganhos.
import type { LossKind } from '@addere/types'

export interface DecompositionSale {
  customerKey: string // `${customerCode}|${loja}`
  productCode: string
  productDesc: string | null
  ymd: string // YYYYMMDD
  amount: number
}

export interface DecompositionInput {
  sales: DecompositionSale[] // base + período atual
  currentFromYmd: string
  currentToYmd: string
  baselineFromYmd: string
  baselineToYmd: string
  /** Fator de normalização: dias do período atual ÷ dias da base (ex.: 15/90 = 0,167) */
  scale: number
  maxCustomers?: number
  maxProducts?: number
}

export interface CustomerLoss {
  customerKey: string
  baselineAmount: number // já normalizada para o período atual
  currentAmount: number
  diffAmount: number
  kind: Exclude<LossKind, 'PRODUCT_DROP'>
  reason: string
}

export interface ProductLoss {
  productCode: string
  productDesc: string | null
  baselineAmount: number
  currentAmount: number
  diffPct: number | null
}

export interface DecompositionResult {
  totals: { baselineAmount: number; currentAmount: number; diffAmount: number; diffPct: number | null }
  components: Array<{ kind: LossKind; amount: number; count: number }>
  customers: CustomerLoss[]
  products: ProductLoss[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const REDUCED_THRESHOLD_PCT = 20 // abaixo disso é ruído de calendário, não queda

function inRange(ymd: string, from: string, to: string): boolean {
  return ymd >= from && ymd <= to
}

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function decomposeLosses(input: DecompositionInput): DecompositionResult {
  const maxCustomers = input.maxCustomers ?? 20
  const maxProducts = input.maxProducts ?? 10

  const baseByCustomer = new Map<string, number>()
  const currByCustomer = new Map<string, number>()
  const baseByProduct = new Map<string, number>()
  const currByProduct = new Map<string, number>()
  const productDesc = new Map<string, string | null>()

  for (const sale of input.sales) {
    if (!productDesc.has(sale.productCode)) productDesc.set(sale.productCode, sale.productDesc)
    if (inRange(sale.ymd, input.currentFromYmd, input.currentToYmd)) {
      currByCustomer.set(sale.customerKey, (currByCustomer.get(sale.customerKey) ?? 0) + sale.amount)
      currByProduct.set(sale.productCode, (currByProduct.get(sale.productCode) ?? 0) + sale.amount)
    } else if (inRange(sale.ymd, input.baselineFromYmd, input.baselineToYmd)) {
      baseByCustomer.set(sale.customerKey, (baseByCustomer.get(sale.customerKey) ?? 0) + sale.amount)
      baseByProduct.set(sale.productCode, (baseByProduct.get(sale.productCode) ?? 0) + sale.amount)
    }
  }

  const keys = new Set([...baseByCustomer.keys(), ...currByCustomer.keys()])
  const customers: CustomerLoss[] = []
  const components = new Map<LossKind, { amount: number; count: number }>([
    ['STOPPED', { amount: 0, count: 0 }],
    ['REDUCED', { amount: 0, count: 0 }],
    ['GAINED', { amount: 0, count: 0 }],
    ['PRODUCT_DROP', { amount: 0, count: 0 }],
  ])

  let totalBase = 0
  let totalCurr = 0
  for (const key of keys) {
    const base = round2((baseByCustomer.get(key) ?? 0) * input.scale)
    const curr = round2(currByCustomer.get(key) ?? 0)
    totalBase += base
    totalCurr += curr
    const diff = round2(curr - base)
    if (base > 0 && curr === 0) {
      customers.push({
        customerKey: key,
        baselineAmount: base,
        currentAmount: curr,
        diffAmount: diff,
        kind: 'STOPPED',
        reason: `Comprava ${fmtBRL(base)} no período e não comprou nada`,
      })
      const c = components.get('STOPPED')!
      c.amount += diff
      c.count++
    } else if (base > 0 && curr > 0 && diff < 0 && Math.abs(diff) / base >= REDUCED_THRESHOLD_PCT / 100) {
      const pct = Math.round((Math.abs(diff) / base) * 100)
      customers.push({
        customerKey: key,
        baselineAmount: base,
        currentAmount: curr,
        diffAmount: diff,
        kind: 'REDUCED',
        reason: `Comprou ${pct}% a menos que a média (${fmtBRL(base)} → ${fmtBRL(curr)})`,
      })
      const c = components.get('REDUCED')!
      c.amount += diff
      c.count++
    } else if (diff > 0 && (base === 0 || diff / Math.max(base, 1) >= REDUCED_THRESHOLD_PCT / 100)) {
      customers.push({
        customerKey: key,
        baselineAmount: base,
        currentAmount: curr,
        diffAmount: diff,
        kind: 'GAINED',
        reason: base === 0 ? `Cliente novo ou recuperado: ${fmtBRL(curr)}` : `Comprou mais que a média (+${fmtBRL(diff)})`,
      })
      const c = components.get('GAINED')!
      c.amount += diff
      c.count++
    }
  }

  const products: ProductLoss[] = []
  for (const code of new Set([...baseByProduct.keys(), ...currByProduct.keys()])) {
    const base = round2((baseByProduct.get(code) ?? 0) * input.scale)
    const curr = round2(currByProduct.get(code) ?? 0)
    if (base <= 0) continue
    const diffPct = round2(((curr - base) / base) * 100)
    if (diffPct >= -REDUCED_THRESHOLD_PCT) continue
    products.push({
      productCode: code,
      productDesc: productDesc.get(code) ?? null,
      baselineAmount: base,
      currentAmount: curr,
      diffPct,
    })
  }
  products.sort((a, b) => a.currentAmount - a.baselineAmount - (b.currentAmount - b.baselineAmount))
  const productDrop = components.get('PRODUCT_DROP')!
  for (const p of products) {
    productDrop.amount += round2(p.currentAmount - p.baselineAmount)
    productDrop.count++
  }

  // Perdas primeiro (mais negativas), ganhos por último
  customers.sort((a, b) => a.diffAmount - b.diffAmount || a.customerKey.localeCompare(b.customerKey))

  totalBase = round2(totalBase)
  totalCurr = round2(totalCurr)
  const diffAmount = round2(totalCurr - totalBase)
  return {
    totals: {
      baselineAmount: totalBase,
      currentAmount: totalCurr,
      diffAmount,
      diffPct: totalBase > 0 ? round2((diffAmount / totalBase) * 100) : null,
    },
    components: [...components.entries()].map(([kind, c]) => ({
      kind,
      amount: round2(c.amount),
      count: c.count,
    })),
    customers: customers.slice(0, maxCustomers),
    products: products.slice(0, maxProducts),
  }
}
