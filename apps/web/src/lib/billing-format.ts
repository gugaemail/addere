// Faturas (plano 016) — formatadores puros do painel, testados em
// __tests__/billing-format.test.ts.
//
// Datas e competências NÃO são formatadas aqui: use formatBillingDate e
// formatCompetence de @addere/types (013), que leem o @db.Date em UTC. O
// formatDate de lib/utils.ts não serve para data de cobrança. Na API, dia
// civil viaja como 'YYYY-MM-DD' e competência como 'YYYY-MM': new
// Date('2026-11-10') é meia-noite UTC, que é o que aqueles formatadores leem.
import type { InvoicePaymentMethod } from '@addere/types'

/** Número da fatura com seis dígitos: 124 → '000124' */
export function formatInvoiceNumber(n: number): string {
  return String(n).padStart(6, '0')
}

const BR_DECIMAL = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})$/ // '1.234,50', '0,1'
const THOUSANDS_ONLY = /^\d{1,3}(?:\.\d{3})+$/ // '1.800'
const PLAIN_INTEGER = /^\d+$/ // '1800'
const DOT_DECIMAL = /^(\d+)\.(\d{1,2})$/ // '1800.5', '2139.80' (o total vindo da API)

/**
 * Valor em reais digitado → string com duas casas, como a API recebe
 * ('1.234,50' → '1234.50'; '0,1' → '0.10'). Sinal só com `allowNegative` (o
 * ajuste devolve com sinal; o desconto é sempre positivo). Vazio, texto, ou
 * vírgula com três casas ('1,234', ambíguo) → null. Sem ponto flutuante.
 */
export function parseMoneyInput(
  text: string,
  options: { allowNegative?: boolean } = {}
): string | null {
  let value = text.trim().replace(/\s/g, '').replace(/^R\$/i, '')
  let sign = ''
  if (value.startsWith('-')) {
    if (!options.allowNegative) return null
    sign = '-'
    value = value.slice(1)
  }
  if (!value) return null

  let integer: string
  let decimals = ''
  const br = BR_DECIMAL.exec(value)
  const dot = DOT_DECIMAL.exec(value)
  if (br) {
    integer = br[1].replace(/\./g, '')
    decimals = br[2]
  } else if (THOUSANDS_ONLY.test(value)) {
    integer = value.replace(/\./g, '')
  } else if (PLAIN_INTEGER.test(value)) {
    integer = value
  } else if (dot) {
    integer = dot[1]
    decimals = dot[2]
  } else {
    return null
  }

  integer = integer.replace(/^0+(?=\d)/, '')
  if (integer.length > 12) return null
  const result = `${integer}.${decimals.padEnd(2, '0')}`
  // '-0,00' é zero, sem sinal
  return sign && result !== '0.00' ? `-${result}` : result
}

/** Dinheiro da API ('2139.80') → texto do campo ('2139,80'), para pré-preencher */
export function moneyToInput(value: string): string {
  return value.replace('.', ',')
}

export const PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  CARD: 'Cartão',
  OTHER: 'Outra',
}
