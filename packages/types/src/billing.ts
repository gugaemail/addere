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

// ─── Situação do cliente ─────────────────────────────────────────────────────
// Fonte única da situação: o 016 passa hasOverdueInvoice, o 017 passa
// accessBlockReason e o 018 reaproveita a função. A precedência está nos
// testes; quem mudar a ordem muda os testes junto.

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

export interface ClientStatusInput {
  contract: {
    status: ContractStatus
    graceMonths: number
    firstBilledCompetence: Date | null
  } | null
  now: Date
  hasOverdueInvoice?: boolean // existe a partir do plano 016
  // existe a partir do plano 017: o mesmo motivo que o authenticate usa.
  // OVERDUE/MANUAL = accessBlockedAt gravado; INACTIVE = empresa desativada.
  accessBlockReason?: 'OVERDUE' | 'MANUAL' | 'INACTIVE' | null
}

export function deriveClientStatus(input: ClientStatusInput): ClientStatus {
  const { contract, now } = input
  const reason = input.accessBlockReason ?? null
  if (reason === 'OVERDUE' || reason === 'MANUAL') return 'BLOCKED'
  if (input.hasOverdueInvoice) return 'OVERDUE'
  if (contract?.status === 'CANCELLED') return 'CANCELLED'
  // Desativada e não cancelada: ninguém da empresa entra, então é bloqueada
  if (reason === 'INACTIVE') return 'BLOCKED'
  if (!contract || contract.status === 'DRAFT') return 'NO_CONTRACT'
  if (contract.status === 'PENDING_ACCEPTANCE') return 'AWAITING_ACCEPTANCE'
  if (
    contract.graceMonths > 0 &&
    contract.firstBilledCompetence &&
    startOfCompetence(now) < contract.firstBilledCompetence
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
  | 'CONTRACT_NOT_ACTIVE'
  | 'INTEL_MANAGED_BY_CONTRACT'

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
}

export interface BillingEventDto {
  id: string
  type: BillingEventType
  actorName: string | null // null = Sistema (jobs dos planos 016 e 017)
  fields: string[] // só os nomes dos campos alterados, nunca os valores
  createdAt: string
}

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
 * É a regra única de "vencida": o 017 (aviso e bloqueio) e o 018 (painel) usam
 * esta função, não uma segunda.
 */
export function invoiceDisplayStatus(
  status: InvoiceStatus,
  dueYmd: string,
  todayYmd: string
): InvoiceDisplayStatus {
  return status === 'OPEN' && dueYmd < todayYmd ? 'OVERDUE' : status
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
