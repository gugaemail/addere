import {
  civilDaySaoPaulo,
  civilYmd,
  formatYmd,
  isPriceIncrease,
  minimumEffectiveDate,
} from '@addere/types'
import { unprocessable } from '../../lib/errors'

// Regras do aditivo (plano 014, decisão de desenho 7; contrato §13 e aditivo
// §3.3). isPriceIncrease e minimumEffectiveDate moram em @addere/types porque o
// painel avisa enquanto o superadmin preenche; aqui ficam reexportadas, junto
// da regra que recusa o envio.

export { isPriceIncrease, minimumEffectiveDate }

/** Hoje em São Paulo, 'AAAA-MM-DD' */
export function todayYmdSaoPaulo(now: Date): string {
  return civilYmd(civilDaySaoPaulo(now))
}

/** O "vale a partir de" gravado (00:01 de São Paulo) → 'AAAA-MM-DD' */
export function effectiveFromYmd(instant: Date | null): string | null {
  return instant ? civilYmd(civilDaySaoPaulo(instant)) : null
}

/**
 * A antecedência de 30 dias é exigida quando o aditivo leva às condições
 * gerais novas, ou quando aumenta o preço e NÃO foi pedido pela Empresa. Com o
 * pedido da Empresa, ele vale no aceite, e o motivo (que entra no texto) é
 * obrigatório. Devolve a data mínima quando a antecedência é exigida.
 */
export function requiredNoticeDate(input: {
  increase: boolean
  requestedByClient: boolean
  carryConditions: boolean
  sentYmd: string
}): string | null {
  const required = input.carryConditions || (input.increase && !input.requestedByClient)
  return required ? minimumEffectiveDate(input.sentYmd) : null
}

export function assertAmendmentNotice(input: {
  increase: boolean
  requestedByClient: boolean
  carryConditions: boolean
  proposedEffectiveFromYmd: string | null
  sentYmd: string
  reason: string | null
}): void {
  if (input.requestedByClient && !input.reason?.trim()) {
    throw unprocessable(
      'Aditivo a pedido da Empresa: escreva no motivo o que ela pediu',
      undefined,
      'AMENDMENT_REASON_REQUIRED'
    )
  }
  const minimum = requiredNoticeDate(input)
  if (minimum === null) return
  // 'AAAA-MM-DD' compara como texto
  if (!input.proposedEffectiveFromYmd || input.proposedEffectiveFromYmd < minimum) {
    throw unprocessable(
      `Este aditivo aumenta o valor: vale a partir de, no mínimo, ${formatYmd(minimum)}.`,
      { minimumEffectiveFrom: minimum },
      'AMENDMENT_NOTICE_TOO_SHORT'
    )
  }
}
