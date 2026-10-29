import type { Product } from '@addere/types'
import { fmtMoeda } from './format'

/** Linha do catálogo com os preços por UF da tabela: "Por UF: MG R$ 9,90 · SP R$ 11,20". */
export function ufPricesLine(ufPrices: Product['ufPrices']): string | null {
  const entries = Object.entries(ufPrices ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return null
  return `Por UF: ${entries.map(([uf, price]) => `${uf} R$ ${fmtMoeda(price)}`).join(' · ')}`
}
