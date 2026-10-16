// Licenças no painel (plano 015) — puro, testado em __tests__/seats.test.ts.
// As regras de quem ocupa licença moram em @addere/types (consumesSeat); aqui
// só o que a tela mostra a partir do SeatUsage que a API devolve.
import {
  SEAT_NEAR_LIMIT_RATIO,
  consumesSeat,
  moneyToCents,
  type DesignatedAdminRef,
  type SeatSubject,
  type SeatUsage,
} from '@addere/types'

export type SeatMeterTone = 'brand' | 'warning' | 'danger'

/** "Licenças 20/22" no cabeçalho de /users; null sem limite */
export function seatsSubtitle(seats: SeatUsage | null | undefined): string | null {
  if (!seats?.enforced || seats.limit === null) return null
  const base = `Licenças ${seats.used}/${seats.limit}`
  return seats.overLimit ? `${base} · acima do limite` : base
}

/** Cor do medidor: marca, alerta a partir de 90 % e perigo no limite ou acima */
export function seatMeterTone(seats: SeatUsage | null | undefined): SeatMeterTone {
  if (!seats?.enforced || seats.limit === null) return 'brand'
  if (seats.used >= seats.limit) return 'danger'
  return seats.used / seats.limit >= SEAT_NEAR_LIMIT_RATIO ? 'warning' : 'brand'
}

/** Percentual do medidor, inteiro; pode passar de 100 acima do limite */
export function seatPercent(seats: SeatUsage): number {
  if (!seats.limit) return seats.used > 0 ? 100 : 0
  return Math.round((seats.used / seats.limit) * 100)
}

/**
 * Quantos desativar para voltar a criar ou ativar: a trava só deixa entrar
 * com uso abaixo do limite, então é o excesso mais um. 0 fora do limite.
 */
export function seatsToFree(seats: SeatUsage | null | undefined): number {
  if (!seats?.enforced || seats.limit === null || seats.used < seats.limit) return 0
  return seats.used - seats.limit + 1
}

/** A frase do aviso acima do limite (decisão padrão 5: ninguém é desativado sozinho) */
export function overLimitMessage(seats: SeatUsage): string {
  const n = seatsToFree(seats)
  return n === 1
    ? 'Desative 1 vendedor ou gerente para voltar a criar ou ativar.'
    : `Desative ${n} vendedores ou gerentes para voltar a criar ou ativar.`
}

/** O salvar do formulário de usuário fica travado? Só se a escrita passaria a ocupar licença no limite */
export function seatBlocksSave(
  seats: SeatUsage | null | undefined,
  before: SeatSubject | null,
  after: SeatSubject
): boolean {
  if (!seats?.enforced || seats.limit === null) return false
  return consumesSeat(before, after) && seats.used >= seats.limit
}

/**
 * Por que o botão "Solicitar mais licenças" está desativado, ou null se ele
 * pode ser usado. Só o administrador indicado pede (decisão padrão 10).
 */
export function licenseRequestBlockedReason(input: {
  userId: string | null | undefined
  designatedAdmin: DesignatedAdminRef | null | undefined
  hasPendingRequest: boolean
}): string | null {
  const admin = input.designatedAdmin
  if (!admin) return 'Sua empresa ainda não tem administrador indicado. Fale com a Addere.'
  if (!admin.valid) {
    return `O administrador indicado (${admin.name}) não está mais ativo. Fale com a Addere para indicar outro.`
  }
  if (admin.id !== input.userId) {
    return `Só ${admin.name}, o administrador indicado, pode pedir licenças.`
  }
  if (input.hasPendingRequest) return 'Você já tem um pedido em análise.'
  return null
}

/** Quantidade × preço por licença, em '1234.56', sem ponto flutuante */
export function monthlyIncrease(quantity: number, unitPrice: string): string {
  const cents = moneyToCents(unitPrice) * quantity
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** Quantidade digitada no modal: inteiro de 1 a 100, ou null */
export function parseLicenseQuantity(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null
  const n = Number(text.trim())
  return n >= 1 && n <= 100 ? n : null
}
