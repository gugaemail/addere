import { Prisma } from '@prisma/client'
import { LICENSE_TYPE_CONTRACT_TEXT, type InvoiceItemKind, type LicenseType } from '@addere/types'
import { type AppError, unprocessable } from '../../lib/errors'
import { isUniqueViolation } from './billing-events'
import { competenceStart, type Ym } from './competence'

// Regras puras do faturamento (plano 016), sem Prisma de banco: testadas sem
// mock. Dinheiro só em Prisma.Decimal; nunca Number, parseFloat nem `+`.

export interface BillableContract {
  status: string
  firstBilledCompetence: Date | null
  endsAt: Date | null
}

/**
 * A competência entra no faturamento? A mesma regra da consulta do gerador
 * (invoices.service.ts, `billableContractsWhere`), em código: o mock do Prisma
 * não aplica `where`, e uma consulta errada não pode virar cobrança. Só `true`
 * quando TODAS valem:
 *
 * - o contrato está ACTIVE ou CANCELLED (DRAFT e PENDING_ACCEPTANCE nunca:
 *   antes do aceite nada começa);
 * - a primeira competência cobrada existe e é <= M (o mês do aceite e a
 *   carência ficam de fora);
 * - não terminou antes de M (`endsAt` nulo ou >= dia 1 de M): o mês do
 *   cancelamento é cobrado, o seguinte não;
 * - CANCELLED sem `endsAt` nunca é cobrado.
 */
export function isCompetenceBillable(contract: BillableContract, ym: Ym): boolean {
  if (contract.status !== 'ACTIVE' && contract.status !== 'CANCELLED') return false
  const start = competenceStart(ym).getTime()
  if (!contract.firstBilledCompetence) return false
  if (contract.firstBilledCompetence.getTime() > start) return false
  if (contract.status === 'CANCELLED' && !contract.endsAt) return false
  if (contract.endsAt && contract.endsAt.getTime() < start) return false
  return true
}

export interface ContractItemInput {
  packageName: string
  licenseType: LicenseType
  includedSeats: number
  extraSeats: number
  packagePrice: Prisma.Decimal | string
  extraSeatPrice: Prisma.Decimal | string
}

export interface DraftItem {
  kind: InvoiceItemKind
  description: string
  quantity: number
  unitPrice: Prisma.Decimal
  amount: Prisma.Decimal
  manual: boolean
}

export const EXTRA_SEATS_DESCRIPTION = 'Licenças adicionais'

/** 'Pacote 20' fica como está; 'Ilimitado' vira 'Pacote Ilimitado' */
function packageLabel(name: string): string {
  return /^pacote\b/i.test(name.trim()) ? name.trim() : `Pacote ${name.trim()}`
}

/** Itens automáticos a partir dos termos da competência: PACKAGE e, se houver, EXTRA_SEATS. */
export function buildContractItems(terms: ContractItemInput): DraftItem[] {
  const packagePrice = new Prisma.Decimal(terms.packagePrice)
  const seats = `${terms.includedSeats} ${terms.includedSeats === 1 ? 'licença' : 'licenças'}`
  const items: DraftItem[] = [
    {
      kind: 'PACKAGE',
      description: `${packageLabel(terms.packageName)} — ${LICENSE_TYPE_CONTRACT_TEXT[terms.licenseType]} (${seats})`,
      quantity: 1,
      unitPrice: packagePrice,
      amount: packagePrice,
      manual: false,
    },
  ]
  if (terms.extraSeats > 0) {
    const extraSeatPrice = new Prisma.Decimal(terms.extraSeatPrice)
    items.push({
      kind: 'EXTRA_SEATS',
      description: EXTRA_SEATS_DESCRIPTION,
      quantity: terms.extraSeats,
      unitPrice: extraSeatPrice,
      amount: extraSeatPrice.times(terms.extraSeats),
      manual: false,
    })
  }
  return items
}

/** Soma exata de valores Decimal. */
export function sumAmounts(amounts: Array<Prisma.Decimal | string>): Prisma.Decimal {
  return amounts.reduce<Prisma.Decimal>(
    (total, amount) => total.plus(new Prisma.Decimal(amount)),
    new Prisma.Decimal(0)
  )
}

/** Dinheiro como viaja na API: string com duas casas */
export function money(value: Prisma.Decimal | string): string {
  return new Prisma.Decimal(value).toFixed(2)
}

// ─── Teto do Decimal(14,2) ───────────────────────────────────────────────────
// Toda coluna de dinheiro é Decimal(14,2): 12 dígitos inteiros. O schema já
// barra cada valor digitado acima disso, mas a soma (itens da fatura) e o
// produto (licenças adicionais × preço) passam do teto e o Postgres recusa com
// "numeric field overflow", que virava 500. O limite por valor no schema não
// resolve por construção: extraSeats vai até 10 000 e a fatura aceita itens à
// mão um a um. Por isso o total calculado é conferido antes de gravar.

/** O maior valor que cabe numa coluna Decimal(14,2) */
export const MONEY_COLUMN_MAX = new Prisma.Decimal('999999999999.99')

/** Cabe numa coluna Decimal(14,2)? Em módulo: desconto é gravado negativo */
export function fitsMoneyColumn(value: Prisma.Decimal | string): boolean {
  return new Prisma.Decimal(value).abs().lte(MONEY_COLUMN_MAX)
}

function amountTooLarge(what: string): AppError {
  return unprocessable(
    `${what} passa do máximo aceito (R$ 999.999.999.999,99). Confira os valores.`,
    { max: MONEY_COLUMN_MAX.toFixed(2) },
    'AMOUNT_TOO_LARGE'
  )
}

/**
 * Total mensal dos termos (pacote + adicionais × preço do adicional), o mesmo
 * de contractMonthlyTotal, conferido contra o teto: o gerador grava esse valor
 * em itens e no total da fatura todo mês. 422 AMOUNT_TOO_LARGE se não couber.
 */
export function assertMonthlyTotalFits(terms: {
  packagePrice: Prisma.Decimal | string
  extraSeats: number
  extraSeatPrice: Prisma.Decimal | string
}): void {
  const total = new Prisma.Decimal(terms.packagePrice).plus(
    new Prisma.Decimal(terms.extraSeatPrice).times(terms.extraSeats)
  )
  if (!fitsMoneyColumn(total)) throw amountTooLarge('O total mensal do contrato')
}

/** Itens e total da fatura antes de gravar: 422 AMOUNT_TOO_LARGE se algum não couber */
export function assertInvoiceFits(
  items: Array<{ amount: Prisma.Decimal | string }>,
  total: Prisma.Decimal | string
): void {
  if (!items.every((i) => fitsMoneyColumn(i.amount)) || !fitsMoneyColumn(total)) {
    throw amountTooLarge('O total da fatura')
  }
}

/** Violação de chave única do Prisma (a mesma regra do histórico do 013) */
export function isP2002(err: unknown): boolean {
  return isUniqueViolation(err)
}
