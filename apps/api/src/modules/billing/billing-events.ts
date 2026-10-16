import { Prisma } from '@prisma/client'
import type { BillingEventType } from '@addere/types'

// Histórico da Gestão Addere (BillingEvent). O evento é gravado na MESMA
// transação da escrita que ele descreve, e uma alteração sem campo mudado não
// grava evento (quem chama confere `fields.length`).

function normalize(value: unknown, isMoney: boolean): string | null {
  if (value === null || value === undefined || value === '') return null
  // Dinheiro comparado por valor: '1800' e o Decimal 1800.00 são iguais
  if (isMoney) return new Prisma.Decimal(value as Prisma.Decimal.Value).toFixed(2)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Nomes, entre `keys`, cujo valor normalizado mudou de `before` para `after`.
 * `null`, `undefined` e `''` são iguais; `Date` vira ISO; só as chaves de
 * `moneyKeys` são comparadas como dinheiro (o número do endereço, por exemplo,
 * nunca é). Sem `before` (criação), devolve os campos preenchidos.
 */
export function changedFields(
  before: object | null | undefined,
  after: object,
  keys: readonly string[],
  moneyKeys: readonly string[] = []
): string[] {
  const b = (before ?? {}) as Record<string, unknown>
  const a = after as Record<string, unknown>
  return keys.filter((key) => {
    const isMoney = moneyKeys.includes(key)
    return normalize(b[key], isMoney) !== normalize(a[key], isMoney)
  })
}

// Identificadores que não são dado pessoal e ajudam a ler o histórico
export interface BillingEventRef {
  packageCode?: string
  termsVersion?: number
  // Plano 014: modelos de contrato e documentos (nunca o texto, o IP ou o e-mail)
  templateKind?: 'CONTRACT' | 'AMENDMENT'
  templateVersion?: number
  documentId?: string
  documentKind?: 'CONTRACT' | 'AMENDMENT'
  requestedByClient?: boolean // aditivo a pedido da Empresa (decisão de desenho 7)
  // Plano 015: pedido de licenças e os termos que a aprovação criou
  licenseRequestId?: string
  termsId?: string
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/**
 * Grava um evento do histórico. `db` é o `prisma` ou o `tx` de uma transação.
 *
 * O payload NUNCA leva valor de campo (LGPD): só os nomes dos campos alterados
 * e, em `ref`, identificadores que não são dado pessoal.
 */
export async function recordBillingEvent(
  db: Prisma.TransactionClient,
  input: {
    type: BillingEventType
    companyId: string | null
    actorId: string | null
    fields: string[]
    ref?: BillingEventRef
  }
): Promise<void> {
  await db.billingEvent.create({
    data: {
      type: input.type,
      companyId: input.companyId,
      actorId: input.actorId,
      payload: { fields: input.fields, ...input.ref },
    },
  })
}
