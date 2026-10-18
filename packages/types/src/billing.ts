// Gestão Addere (planos 013 a 018) — regras puras de cobrança e situação do
// cliente, mais os DTOs que a API devolve e o painel consome. Testado em
// apps/api/src/modules/billing/__tests__/billing-rules.test.ts (este pacote não
// tem script de teste, e o Vitest da API só procura em apps/api/src).
//
// A conversão instante → dia civil em São Paulo é uma réplica mínima do
// ymdSaoPaulo de apps/api/src/modules/intelligence/engine/business-days.ts:
// @addere/types não pode importar de apps/api (a dependência vai no sentido
// contrário, e o web e o app também importam daqui). Diferença proposital: o
// formatador é criado na primeira chamada, não no carregamento do módulo,
// porque o barrel também é carregado pelo app mobile, que não usa nada daqui.

// Só tipo: some na compilação, então não cria ciclo de módulo com o barrel
import type { CompanyAccess } from './index'

// ─── Enums (os mesmos valores dos enums do Prisma) ──────────────────────────

export const LICENSE_TYPES = ['STANDARD', 'INTELLIGENCE'] as const
export type LicenseType = (typeof LICENSE_TYPES)[number]

export type ContractStatus = 'DRAFT' | 'PENDING_ACCEPTANCE' | 'ACTIVE' | 'CANCELLED'
export type ContractTermsStatus = 'PROPOSED' | 'EFFECTIVE' | 'WITHDRAWN'
export type ContractTermsOrigin = 'CONTRACT' | 'AMENDMENT' | 'LICENSE_REQUEST'

// ─── Calendário de cobrança ──────────────────────────────────────────────────
// Competência e vencimento são @db.Date: meia-noite UTC do dia civil em
// America/Sao_Paulo, a mesma convenção de VisitPlan.date.

let spFormatter: Intl.DateTimeFormat | null = null

function civilDateInSaoPaulo(date: Date): { year: number; month: number; day: number } {
  spFormatter ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [year, month, day] = spFormatter.format(date).split('-').map(Number)
  return { year, month, day }
}

/** Competência (mês civil em São Paulo) do instante, como @db.Date: dia 1 à meia-noite UTC. */
export function startOfCompetence(date: Date): Date {
  const { year, month } = civilDateInSaoPaulo(date)
  return new Date(Date.UTC(year, month - 1, 1))
}

export function addCompetenceMonths(competence: Date, months: number): Date {
  return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + months, 1))
}

/**
 * 00:00 de São Paulo no dia 1 da competência. UTC−3 fixo: o Brasil não tem
 * horário de verão desde 2019 (Decreto 9.772). Se voltar a ter, revise aqui.
 */
export function competenceStartInstant(competence: Date): Date {
  return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth(), 1, 3))
}

/**
 * Dia civil de São Paulo do instante, como @db.Date (meia-noite UTC). É o
 * startDate do aceite e a forma de formatar instantes com formatBillingDate.
 */
export function civilDaySaoPaulo(instant: Date): Date {
  const { year, month, day } = civilDateInSaoPaulo(instant)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * 'AAAA-MM-DD' → 00:01 de São Paulo desse dia: é como o "vale a partir de" de
 * um aditivo é gravado (plano 014). Na competência que começa nesse dia, o
 * termo já entra depois das 00:00 e é cobrado só no mês seguinte. UTC−3 fixo,
 * como em competenceStartInstant. Lança RangeError para data inválida.
 */
export function effectiveInstantOfDay(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new RangeError(`data inválida: ${ymd}`)
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const civil = new Date(Date.UTC(year, month - 1, day))
  if (civil.getUTCMonth() !== month - 1 || civil.getUTCDate() !== day) {
    throw new RangeError(`data inválida: ${ymd}`)
  }
  return new Date(Date.UTC(year, month - 1, day, 3, 1))
}

/** A fatura da competência M sai no início de M+1 e vence no dia `dueDay` de M+1. */
export function dueDateForCompetence(competence: Date, dueDay: number): Date {
  return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + 1, dueDay))
}

export const DUE_DAY_MIN = 1
export const DUE_DAY_MAX = 10
export const GRACE_MONTHS_MAX = 12

export function computeBillingCalendar(input: {
  acceptDate: Date
  graceMonths: number
  dueDay: number
}): { firstBilledCompetence: Date; firstDueDate: Date } {
  const { acceptDate, graceMonths, dueDay } = input
  if (!Number.isInteger(dueDay) || dueDay < DUE_DAY_MIN || dueDay > DUE_DAY_MAX) {
    throw new RangeError('dueDay fora de 1 a 10')
  }
  if (!Number.isInteger(graceMonths) || graceMonths < 0) {
    throw new RangeError('graceMonths negativo')
  }
  // O mês do aceite não é cobrado; depois correm os meses de carência
  const firstBilledCompetence = addCompetenceMonths(startOfCompetence(acceptDate), 1 + graceMonths)
  return {
    firstBilledCompetence,
    firstDueDate: dueDateForCompetence(firstBilledCompetence, dueDay),
  }
}

// ─── Resolução de termos ─────────────────────────────────────────────────────
// Só EFFECTIVE conta. PROPOSED e WITHDRAWN nunca contam, nem com effectiveFrom.

export interface TermsForResolution {
  status: ContractTermsStatus
  effectiveFrom: Date | null
  version: number
}

function latestEffective<T extends TermsForResolution>(terms: readonly T[], limit: Date): T | null {
  let best: T | null = null
  let bestTime = -Infinity
  for (const t of terms) {
    if (t.status !== 'EFFECTIVE' || !t.effectiveFrom) continue
    const time = t.effectiveFrom.getTime()
    if (time > limit.getTime()) continue
    if (time > bestTime || (time === bestTime && best !== null && t.version > best.version)) {
      best = t
      bestTime = time
    }
  }
  return best
}

/** Termos atuais: valem para o limite de licenças e para a Inteligência, na hora. */
export function resolveCurrentTerms<T extends TermsForResolution>(
  terms: readonly T[],
  now: Date
): T | null {
  return latestEffective(terms, now)
}

/**
 * Termos da competência M: o EFFECTIVE de maior effectiveFrom ESTRITAMENTE
 * anterior ao início de M. Entrou no mês (inclusive às 00:00 do dia 1), cobra
 * no seguinte. Decisão da revisão de 15/10/2026.
 */
export function resolveCompetenceTerms<T extends TermsForResolution>(
  terms: readonly T[],
  competence: Date
): T | null {
  return latestEffective(terms, new Date(competenceStartInstant(competence).getTime() - 1))
}

// ─── Total mensal ────────────────────────────────────────────────────────────
// Em centavos inteiros, para não ter erro de ponto flutuante. Entrada e saída
// são strings '1234.56', como o Decimal serializado.

function toCents(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!m) throw new RangeError(`valor monetário inválido: ${value}`)
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/**
 * '1234.56' → 123456 centavos. É o toCents acima, exportado (plano 014) para
 * comparar e converter dinheiro sem ponto flutuante. Lança RangeError para
 * valor que não seja dígitos com até duas casas.
 */
export function moneyToCents(value: string): number {
  return toCents(value)
}

/**
 * Dinheiro → 'R$ 1.234,56', com espaço comum, ponto de milhar e vírgula
 * decimal. Sem Intl de propósito: o texto entra no contrato com hash, e o Intl
 * usa espaço não separável, cujo caractere muda com a versão do ICU. Converte
 * por centavos; número passa por toFixed(2) antes.
 */
export function formatBrl(value: string | number): string {
  const cents = moneyToCents(typeof value === 'number' ? value.toFixed(2) : value)
  const integer = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${integer},${String(cents % 100).padStart(2, '0')}`
}

/** packagePrice + extraSeats × extraSeatPrice. Cobra o contratado, não o uso. */
export function contractMonthlyTotal(t: {
  packagePrice: string
  extraSeats: number
  extraSeatPrice: string
}): string {
  const cents = toCents(t.packagePrice) + t.extraSeats * toCents(t.extraSeatPrice)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// ─── Licenças (plano 015) ────────────────────────────────────────────────────
// Quem ocupa licença: vendedor ou gerente (SALESPERSON) ativo, dentro de uma
// empresa. ADMIN é grátis; desativar libera a licença na hora.

/** O que importa de um usuário para a licença, antes e depois de uma escrita. */
export interface SeatSubject {
  role: string
  active: boolean
  companyId: string | null
}

/** Vendedor ou gerente (SALESPERSON) ativo, dentro de uma empresa, ocupa licença. */
export function holdsSeat(u: SeatSubject): boolean {
  // === true e !!: usuário sem role nem active (mock de teste, select parcial)
  // cai em "não ocupa"
  return !!u.companyId && u.active === true && u.role === 'SALESPERSON'
}

/** A escrita passa a ocupar uma licença que antes não ocupava, na mesma empresa? */
export function consumesSeat(before: SeatSubject | null, after: SeatSubject): boolean {
  if (!holdsSeat(after)) return false
  return !(before !== null && holdsSeat(before) && before.companyId === after.companyId)
}

/** Limite do contrato: incluídas + adicionais. O Ilimitado tem quantidade digitada. */
export function seatLimit(terms: { includedSeats: number; extraSeats: number }): number {
  return terms.includedSeats + terms.extraSeats
}

/**
 * "Perto do limite", em percentual inteiro: o painel do 018 compara em conta
 * inteira (used × 100 ≥ limit × 90), sem ponto flutuante.
 */
export const NEAR_SEAT_LIMIT_PCT = 90

/** O mesmo corte como razão — o medidor de licenças do 015 fica em alerta. */
export const SEAT_NEAR_LIMIT_RATIO = NEAR_SEAT_LIMIT_PCT / 100

/**
 * A frase que o administrador indicado aceita ao pedir licenças adicionais.
 * O painel mostra o resultado e a API grava o mesmo texto, com o SHA-256: a
 * função e as entradas são as mesmas, então o texto gravado é o mostrado. O
 * plural é o texto aprovado em 15/10/2026, palavra por palavra; o singular só
 * faz a concordância. Dinheiro pelo formatBrl, sem Intl.
 */
export function licenseRequestDeclaration(quantity: number, unitPrice: string | number): string {
  const price = formatBrl(unitPrice)
  return quantity === 1
    ? `Ao enviar, você contrata 1 licença adicional a ${price} por mês, cobrada a partir do mês seguinte à liberação.`
    : `Ao enviar, você contrata ${quantity} licenças adicionais a ${price} por mês cada, cobradas a partir do mês seguinte à liberação.`
}

// ─── Situação do cliente ─────────────────────────────────────────────────────
// Fonte única da situação: a lista de Clientes, a ficha e o painel do 018 leem
// esta função, com as faturas em aberto e o motivo do bloqueio reais. A
// precedência está nos testes em tabela (billing-rules.test.ts); quem mudar a
// ordem muda os testes junto.
//
// Dias como 'YYYYMMDD': hoje em São Paulo (ymdSaoPaulo na API) e o @db.Date
// lido em UTC (dateToYmdUtc). É o formato de invoiceDisplayStatus.

/** 'YYYYMM' de um @db.Date (competência), lido em UTC */
function ymOfCivilDate(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Fatura em aberto vencida: vencimento ANTERIOR a hoje, em dias civis. Vence
 * hoje não é vencida. Os dois 'YYYYMMDD'; quem chama passa só faturas OPEN.
 */
export function isInvoiceOverdue(dueDate: string, today: string): boolean {
  return dueDate < today
}

/**
 * O contrato já é cobrado no mês corrente? ACTIVE e com a 1ª competência
 * cobrada já chegada (mês de `today` ≥ mês da firstBilledCompetence). Fica de
 * fora o mês do aceite, que nunca é cobrado, e a carência. É a pergunta do MRR
 * faturável do painel, diferente da situação IN_GRACE, que só existe com
 * carência > 0. ACTIVE sem firstBilledCompetence não deveria existir (o aceite
 * grava os dois juntos); se aparecer, não é faturável — o lado que não infla.
 */
export function isBillableNow(
  contract: { status: ContractStatus; firstBilledCompetence: Date | null } | null,
  today: string
): boolean {
  if (!contract || contract.status !== 'ACTIVE' || !contract.firstBilledCompetence) return false
  return today.slice(0, 6) >= ymOfCivilDate(contract.firstBilledCompetence)
}

export type ClientStatus =
  | 'NO_CONTRACT'
  | 'AWAITING_ACCEPTANCE'
  | 'IN_GRACE'
  | 'CURRENT'
  | 'OVERDUE'
  | 'BLOCKED'
  | 'CANCELLED'

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  NO_CONTRACT: 'Sem contrato',
  AWAITING_ACCEPTANCE: 'Aguardando aceite',
  IN_GRACE: 'Em carência',
  CURRENT: 'Em dia',
  OVERDUE: 'Vencido',
  BLOCKED: 'Bloqueado',
  CANCELLED: 'Cancelado',
}

/** A ordem da linha "Clientes por situação" do painel (plano 018) */
export const CLIENT_STATUS_ORDER: readonly ClientStatus[] = [
  'NO_CONTRACT',
  'AWAITING_ACCEPTANCE',
  'IN_GRACE',
  'CURRENT',
  'OVERDUE',
  'BLOCKED',
  'CANCELLED',
]

// Plano 018: tudo obrigatório, para o compilador apontar quem ainda não passa
// os dados reais de fatura e de bloqueio.
export interface ClientStatusInput {
  contract: {
    status: ContractStatus
    graceMonths: number
    firstBilledCompetence: Date | null
  } | null
  /** Hoje em São Paulo, 'YYYYMMDD' (ymdSaoPaulo na API) */
  today: string
  /** Vencimentos das faturas OPEN da empresa, 'YYYYMMDD' (dateToYmdUtc do @db.Date) */
  openInvoiceDueDates: readonly string[]
  /**
   * O mesmo motivo que o authenticate usa (resolveCompanyAccess, plano 017):
   * OVERDUE/MANUAL = accessBlockedAt gravado; INACTIVE = empresa desativada.
   * A liberação manual (blockExemptUntil) não entra: liberada com fatura
   * vencida é OVERDUE.
   */
  accessBlockReason: 'OVERDUE' | 'MANUAL' | 'INACTIVE' | null
}

export function deriveClientStatus(input: ClientStatusInput): ClientStatus {
  const { contract, today, accessBlockReason: reason } = input
  if (reason === 'OVERDUE' || reason === 'MANUAL') return 'BLOCKED'
  if (input.openInvoiceDueDates.some((due) => isInvoiceOverdue(due, today))) return 'OVERDUE'
  if (contract?.status === 'CANCELLED') return 'CANCELLED'
  // Desativada e não cancelada: ninguém da empresa entra, então é bloqueada
  if (reason === 'INACTIVE') return 'BLOCKED'
  if (!contract || contract.status === 'DRAFT') return 'NO_CONTRACT'
  if (contract.status === 'PENDING_ACCEPTANCE') return 'AWAITING_ACCEPTANCE'
  if (
    contract.graceMonths > 0 &&
    contract.firstBilledCompetence &&
    today.slice(0, 6) < ymOfCivilDate(contract.firstBilledCompetence)
  ) {
    return 'IN_GRACE'
  }
  return 'CURRENT'
}

// ─── Cadastro ────────────────────────────────────────────────────────────────

export const BRAZIL_UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const
export type BrazilUf = (typeof BRAZIL_UFS)[number]

/** CPF com os dois dígitos verificadores certos. Aceita com ou sem pontuação. */
export function isValidCpf(value: string): boolean {
  if (!/^[\d.\-\s]*$/.test(value)) return false
  const d = value.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digits = d.split('').map(Number)
  for (const len of [9, 10]) {
    let sum = 0
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i)
    if (((sum * 10) % 11) % 10 !== digits[len]) return false
  }
  return true
}

// ─── Formatação de @db.Date ──────────────────────────────────────────────────
// Leem getUTC*, então o dia civil gravado sai igual em qualquer fuso, no
// navegador e na API. Use sempre estes para competência e vencimento: o
// formatDate de apps/web/src/lib/utils.ts só acerta o @db.Date porque detecta
// a meia-noite UTC exata, e formatado no fuso do navegador ele cairia no dia
// anterior no Brasil.

/** Competência → 'MM/AAAA' */
export function formatCompetence(c: Date): string {
  return `${String(c.getUTCMonth() + 1).padStart(2, '0')}/${c.getUTCFullYear()}`
}

/** Dia civil (@db.Date) → 'DD/MM/AAAA' */
export function formatBillingDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getUTCFullYear()}`
}

// ─── Histórico e erros ───────────────────────────────────────────────────────

// Lista fechada dos tipos de BillingEvent (a coluna é String). Cada plano que
// cria tipo acrescenta aqui e o rótulo em BILLING_EVENT_LABELS, no web.
export const BILLING_EVENT_TYPES = [
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'CONTRACT_DRAFT_CREATED',
  'CONTRACT_DRAFT_UPDATED',
  'PACKAGE_CREATED',
  'PACKAGE_UPDATED',
  'PACKAGE_ACTIVATED',
  'PACKAGE_DEACTIVATED',
  'SETTINGS_UPDATED',
  // Plano 014: modelos de contrato, documentos e aceite
  'TEMPLATE_VERSION_CREATED',
  'TEMPLATE_PUBLISHED',
  'DOCUMENT_SENT',
  'DOCUMENT_RESENT',
  'DOCUMENT_CANCELLED',
  'DOCUMENT_ACCEPTED',
  'AMENDMENT_PROPOSED',
  'AMENDMENT_WITHDRAWN',
  'INTELLIGENCE_APPLIED',
  'DESIGNATED_ADMIN_CHANGED',
  // Plano 016: faturas, lembretes e encerramento do contrato
  'INVOICE_GENERATED',
  'INVOICE_CREATED',
  'INVOICE_RECALCULATED',
  'INVOICE_PAID',
  'INVOICE_CANCELLED',
  'INVOICE_ITEM_ADDED',
  'INVOICE_ITEM_REMOVED',
  'INVOICE_UPDATED',
  'INVOICE_DUE_REMINDER_SENT',
  'DOCUMENT_PENDING_REMINDER_SENT',
  'CONTRACT_CANCEL_SCHEDULED',
  'CONTRACT_CANCEL_REVERTED',
  'CONTRACT_ENDED',
  // Plano 015: pedido de licenças adicionais
  'LICENSE_REQUEST_CREATED',
  'LICENSE_REQUEST_APPROVED',
  'LICENSE_REQUEST_REJECTED',
  // Plano 017: aviso de suspensão, lembrete, bloqueio e liberação
  'SUSPENSION_NOTICE_SENT',
  'SUSPENSION_REMINDER_SENT',
  'ACCESS_BLOCKED',
  'ACCESS_UNBLOCKED',
] as const
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number]

/** Códigos de AppError da Gestão Addere (vão na resposta como `code`) */
export type BillingErrorCode =
  | 'CONTRACT_NOT_DRAFT'
  | 'PACKAGE_INACTIVE'
  | 'INCLUDED_SEATS_REQUIRED'
  | 'PACKAGE_CODE_TAKEN'
  | 'CNPJ_TAKEN'
  // Plano 014
  | 'TEMPLATE_DRAFT_EXISTS'
  | 'TEMPLATE_NOT_DRAFT'
  | 'TEMPLATE_NOT_PUBLISHABLE'
  | 'TEMPLATE_NOT_PUBLISHED'
  | 'NOTHING_TO_SEND'
  | 'DESIGNATED_ADMIN_REQUIRED'
  | 'DESIGNATED_ADMIN_INVALID'
  | 'NOT_DESIGNATED_ADMIN'
  | 'CONTRACT_FIELDS_MISSING'
  | 'DOCUMENT_ALREADY_SENT'
  | 'DOCUMENT_NOT_PENDING'
  | 'DOCUMENT_HASH_MISMATCH'
  | 'AMENDMENT_NOTICE_TOO_SHORT'
  | 'AMENDMENT_REASON_REQUIRED'
  | 'AMENDMENT_NOT_YET_EFFECTIVE'
  | 'TERMS_NOT_EDITABLE'
  | 'CONTRACT_NOT_ACTIVE'
  | 'INTEL_MANAGED_BY_CONTRACT'
  // Plano 016
  | 'CONTRACT_CANCEL_ALREADY_SCHEDULED'
  | 'CONTRACT_CANCEL_NOT_SCHEDULED'
  | 'INVOICE_ALREADY_EXISTS'
  | 'INVOICE_PAID_IMMUTABLE'
  | 'INVOICE_CANCELLED'
  | 'INVOICE_ITEM_NOT_MANUAL'
  | 'INVOICE_NEGATIVE_TOTAL'
  | 'COMPETENCE_NOT_PAST'
  | 'COMPETENCE_NOT_BILLABLE'
  | 'DUE_DATE_IN_PAST'
  | 'PAID_AT_IN_FUTURE'
  // Plano 015
  | 'SEAT_LIMIT_REACHED'
  | 'CONTRACT_CANCELLED'
  | 'LICENSE_PRICE_CHANGED'
  | 'LICENSE_REQUEST_PENDING'
  | 'LICENSE_REQUEST_ALREADY_DECIDED'
  | 'AMENDMENT_PENDING'

// ─── DTOs ────────────────────────────────────────────────────────────────────
// Datas como string ISO; dinheiro como string '1234.56'.

export interface LicensePackageDto {
  id: string
  code: string
  name: string
  seats: number | null // null = quantidade digitada no contrato (Ilimitado)
  listPriceStandard: string | null
  listPriceIntelligence: string | null
  listExtraSeatPriceStandard: string | null
  listExtraSeatPriceIntelligence: string | null
  active: boolean
  sortOrder: number
}

export interface BillingSettingsDto {
  overdueBlockDays: number
  dueReminderDays: number
  autoBlockEnabled: boolean
  notifyEmail: string | null
  updatedAt: string
}

export interface ClientProfileDto {
  companyId: string
  legalName: string
  tradeName: string | null
  stateRegistration: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressDistrict: string | null
  addressCity: string | null
  addressState: string | null
  addressZip: string | null // só dígitos
  legalRepName: string | null
  legalRepCpf: string | null // só dígitos
  legalRepRole: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  billingContactName: string | null
  billingEmail: string | null
  billingPhone: string | null
  notes: string | null
}

export interface ContractTermsDto {
  id: string
  version: number
  status: ContractTermsStatus
  origin: ContractTermsOrigin
  proposedEffectiveFrom: string | null
  effectiveFrom: string | null
  packageId: string
  packageCode: string
  packageName: string
  licenseType: LicenseType
  includedSeats: number
  extraSeats: number
  packagePrice: string
  extraSeatPrice: string
  monthlyTotal: string
  reason: string | null
  createdByName: string | null
  createdAt: string
}

export interface CompanyContractDto {
  id: string
  status: ContractStatus
  startDate: string | null // @db.Date
  graceMonths: number
  firstBilledCompetence: string | null // @db.Date
  dueDay: number
  overdueBlockDays: number | null // null = padrão das regras globais
  terms: ContractTermsDto[]
  // Encerramento (plano 016): o contrato segue ACTIVE até endsAt
  endsAt: string | null // 'YYYY-MM-DD', último dia coberto
  cancelRequestedAt: string | null // ISO
  cancelReason: string | null
  deactivateCompanyOnEnd: boolean
}

export interface ClientListItemDto {
  id: string
  name: string
  cnpj: string
  idProtheus: string | null
  active: boolean
  createdAt: string
  legalName: string | null
  tradeName: string | null
  status: ClientStatus
  contractStatus: ContractStatus | null
  current: {
    packageName: string
    licenseType: LicenseType
    seatLimit: number
    monthlyTotal: string
  } | null
  proposed: { packageName: string; licenseType: LicenseType } | null
  usedSeats: number // vendedores e gerentes ativos; ADMIN não conta
}

export interface ClientDetailDto {
  company: {
    id: string
    name: string
    cnpj: string
    idProtheus: string | null
    active: boolean
    createdAt: string
  }
  profile: ClientProfileDto | null // null = empresa criada antes do cadastro comercial
  contract: CompanyContractDto | null
  status: ClientStatus
  usedSeats: number
  seatLimit: number | null // null = sem limite
  block: ClientBlockState // plano 017: o cartão "Acesso"
}

export interface BillingEventDto {
  id: string
  type: BillingEventType
  actorName: string | null // null = Sistema (jobs dos planos 016 e 017)
  fields: string[] // só os nomes dos campos alterados, nunca os valores
  createdAt: string
}

// ─── Licenças (plano 015) ────────────────────────────────────────────────────

/** Quem ocupa licença: vendedor ou gerente ativo da empresa */
export interface SeatHolder {
  id: string
  name: string
  email: string
  intelManager: boolean // true = Gerente
}

/**
 * Licenças da empresa. `enforced` só é true com contrato ACTIVE; sem isso não
 * há limite, e `limit` e `available` são null.
 */
export interface SeatUsage {
  contractStatus: ContractStatus | null
  enforced: boolean
  used: number
  limit: number | null
  available: number | null
  overLimit: boolean // redução de pacote: ninguém é desativado, só não entra mais
  holders: SeatHolder[]
}

export type LicenseRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface LicenseRequestDto {
  id: string
  companyId: string
  companyName: string
  quantity: number
  message: string | null
  unitPriceShown: string // '99.00'
  monthlyIncrease: string // quantidade × preço, '198.00'
  declarationText: string
  status: LicenseRequestStatus
  requestedAt: string
  requestedByName: string
  decidedAt: string | null
  decidedByName: string | null
  decisionReason: string | null
  resultingTermsId: string | null
  // Auditoria: só as rotas de superadmin preenchem
  requestedIp?: string | null
  declarationSha256?: string
}

export interface LicenseRequestInput {
  quantity: number
  message?: string
  unitPriceShown: string
}

export type LicenseRequestDecision =
  { decision: 'APPROVE' } | { decision: 'REJECT'; reason: string }

// ─── Entradas ────────────────────────────────────────────────────────────────

export interface ClientProfileInput {
  legalName: string
  tradeName?: string | null
  stateRegistration?: string | null
  addressStreet?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  addressDistrict?: string | null
  addressCity?: string | null
  addressState?: string | null
  addressZip?: string | null
  legalRepName?: string | null
  legalRepCpf?: string | null
  legalRepRole?: string | null
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  billingContactName?: string | null
  billingEmail?: string | null
  billingPhone?: string | null
  notes?: string | null
}

export interface ClientInput {
  name: string
  cnpj: string
  idProtheus?: string | null
  profile: ClientProfileInput
}

export interface ContractDraftInput {
  packageId: string
  licenseType: LicenseType
  includedSeats?: number // só no pacote sem quantidade fixa (Ilimitado)
  extraSeats: number
  packagePrice: string
  extraSeatPrice: string
  graceMonths: number
  dueDay: number
  overdueBlockDays: number | null // null = padrão das regras globais
  reason: string | null
}

// ─── Faturamento (plano 016) ─────────────────────────────────────────────────
// Datas de calendário como 'YYYY-MM-DD' e competência como 'YYYY-MM', nunca
// como timestamp: é o que impede o deslocamento de um dia no navegador.
// Dinheiro como string com duas casas ('2139.80').

export type InvoiceStatus = 'OPEN' | 'PAID' | 'CANCELLED'
export type InvoiceDisplayStatus = InvoiceStatus | 'OVERDUE'
export type InvoiceOrigin = 'JOB' | 'MANUAL'
export type InvoiceItemKind = 'PACKAGE' | 'EXTRA_SEATS' | 'DISCOUNT' | 'ADJUSTMENT'
export type InvoicePaymentMethod = 'PIX' | 'BOLETO' | 'TRANSFER' | 'CARD' | 'OTHER'

export const INVOICE_PAYMENT_METHODS: readonly InvoicePaymentMethod[] = [
  'PIX',
  'BOLETO',
  'TRANSFER',
  'CARD',
  'OTHER',
]

/**
 * Vencida = OPEN e vencimento < hoje. Os dois em 'YYYYMMDD', hoje em São Paulo.
 * A comparação é a de isInvoiceOverdue (018), que a situação do cliente e o
 * painel também usam: uma regra só de "vencida".
 */
export function invoiceDisplayStatus(
  status: InvoiceStatus,
  dueYmd: string,
  todayYmd: string
): InvoiceDisplayStatus {
  return status === 'OPEN' && isInvoiceOverdue(dueYmd, todayYmd) ? 'OVERDUE' : status
}

export interface InvoiceItemDto {
  id: string
  kind: InvoiceItemKind
  description: string
  quantity: number
  unitPrice: string // '1990.00'
  amount: string
  manual: boolean
}

export interface InvoiceDto {
  id: string
  number: number
  companyId: string
  companyName: string
  competence: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  status: InvoiceStatus
  displayStatus: InvoiceDisplayStatus
  origin: InvoiceOrigin
  total: string
  paidAt: string | null // 'YYYY-MM-DD'
  paidAmount: string | null
  paymentMethod: InvoicePaymentMethod | null
  paymentNote: string | null
  paidByName: string | null
  nfNumber: string | null
  notes: string | null
  cancelledAt: string | null // ISO
  cancelledByName: string | null
  cancelReason: string | null
  items: InvoiceItemDto[]
}

export interface InvoiceListResponse {
  items: InvoiceDto[]
  total: number
  page: number
  pageSize: number
}

/** O que o ADMIN do cliente vê: sem observação interna, motivo e nomes. */
export type MyInvoiceDto = Pick<
  InvoiceDto,
  | 'id'
  | 'number'
  | 'competence'
  | 'dueDate'
  | 'displayStatus'
  | 'total'
  | 'paidAt'
  | 'nfNumber'
  | 'items'
>

// ─── Inadimplência e bloqueio (plano 017) ────────────────────────────────────

/** Estado do bloqueio na ficha do cliente (superadmin). Datas 'YYYY-MM-DD'. */
export interface ClientBlockState {
  companyActive: boolean
  blockedAt: string | null // ISO
  reason: 'OVERDUE' | 'MANUAL' | null // MANUAL: reservado, nenhum código grava
  exemptUntil: string | null // só a liberação vigente (até hoje, inclusive)
  pendingNotice: {
    invoiceId: string
    invoiceNumber: number
    sentAt: string // ISO
    plannedBlockDate: string
  } | null
}

/** GET /billing/me/overdue — a faixa do ADMIN. */
export interface BillingOverdueStatus {
  access: CompanyAccess
  blockedAt: string | null // ISO
  // competence 'YYYY-MM' e dueDate 'YYYY-MM-DD', como nas faturas do 016
  invoice: { id: string; number: number; competence: string; dueDate: string } | null
  plannedBlockDate: string | null // 'YYYY-MM-DD'
}

// ─── Painel da Gestão Addere (plano 018) ─────────────────────────────────────
// GET /admin/billing/dashboard. Dinheiro chega como string com 2 casas e ponto
// decimal ("12167.50"): é a soma Decimal da API, sem passar por float. As
// definições de cada número estão em docs/billing/README.md.

export const DASHBOARD_LIST_LIMIT = 5
export const UPCOMING_DUE_DAYS = 15

export interface MoneyTotal {
  count: number
  amount: string
}

export interface DashboardList<T> {
  total: number // tamanho real da lista; items traz no máximo DASHBOARD_LIST_LIMIT
  items: T[]
}

export interface DashboardInvoiceItem {
  invoiceId: string
  companyId: string
  companyName: string
  number: number // Invoice.number (sequencial global)
  competence: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  total: string
  daysOverdue: number // 0 nas que ainda não venceram
}

export interface DashboardDocumentItem {
  documentId: string
  companyId: string
  companyName: string
  kind: 'CONTRACT' | 'AMENDMENT'
  sentAt: string // ISO
  daysWaiting: number // dias civis em São Paulo desde o envio
}

export interface DashboardLicenseRequestItem {
  requestId: string
  companyId: string
  companyName: string
  quantity: number
  createdAt: string // ISO
}

export interface DashboardSeatItem {
  companyId: string
  companyName: string
  used: number
  limit: number
}

export interface RevenueMonth {
  month: string // 'YYYY-MM'
  billed: string // faturado por competência
  received: string // recebido no mês da baixa
}

export interface BillingDashboardDto {
  generatedAt: string // ISO
  today: string // 'YYYY-MM-DD' em São Paulo
  mrr: {
    contracted: string
    billable: string
    activeContracts: number
    // ACTIVE ainda fora do MRR faturável (isBillableNow falso): o mês do aceite
    // ou a carência. Não é a contagem da situação IN_GRACE, que exige carência > 0
    graceContracts: number
  }
  clientsByStatus: Record<ClientStatus, number> // as sete chaves, sempre
  seats: { used: number; limit: number } // só contratos ACTIVE
  receivable: {
    open: MoneyTotal
    overdue: MoneyTotal
    dueNext15Days: MoneyTotal
    receivedThisMonth: MoneyTotal
  }
  overdueInvoices: DashboardList<DashboardInvoiceItem>
  upcomingInvoices: DashboardList<DashboardInvoiceItem>
  pendingAcceptance: DashboardList<DashboardDocumentItem>
  pendingLicenseRequests: DashboardList<DashboardLicenseRequestItem>
  nearSeatLimit: DashboardList<DashboardSeatItem>
  revenue12m: RevenueMonth[] // 12 meses fechados, do mais antigo ao mais recente
}
