// Gestão Addere (plano 013) — rótulos, cores e conversão de dinheiro do painel.
// Puro e testado em __tests__/billing-ui.test.ts; as telas não têm teste de render.
import {
  computeBillingCalendar,
  contractMonthlyTotal,
  resolveCurrentTerms,
  type BillingEventType,
  type ClientStatus,
  type CompanyContractDto,
  type ContractStatus,
  type ContractTermsDto,
  type ContractTermsStatus,
  type LicensePackageDto,
  type LicenseType,
} from '@addere/types'

// Repete a união de variantes do Badge (components/ui/Badge.tsx), que não é exportada
export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const CLIENT_STATUS_BADGE: Record<ClientStatus, BadgeVariant> = {
  NO_CONTRACT: 'neutral',
  AWAITING_ACCEPTANCE: 'info',
  IN_GRACE: 'info',
  CURRENT: 'success',
  OVERDUE: 'warning',
  BLOCKED: 'danger',
  CANCELLED: 'neutral',
}

// Record: cada tipo novo dos planos 014 a 018 só compila com o rótulo dele
export const BILLING_EVENT_LABELS: Record<BillingEventType, string> = {
  CLIENT_CREATED: 'Cliente cadastrado',
  CLIENT_UPDATED: 'Cadastro alterado',
  CONTRACT_DRAFT_CREATED: 'Rascunho do contrato criado',
  CONTRACT_DRAFT_UPDATED: 'Rascunho do contrato alterado',
  PACKAGE_CREATED: 'Pacote criado',
  PACKAGE_UPDATED: 'Pacote alterado',
  PACKAGE_ACTIVATED: 'Pacote ativado',
  PACKAGE_DEACTIVATED: 'Pacote desativado',
  SETTINGS_UPDATED: 'Regras de cobrança alteradas',
  // Plano 014
  TEMPLATE_VERSION_CREATED: 'Versão de modelo criada',
  TEMPLATE_PUBLISHED: 'Modelo publicado',
  DOCUMENT_SENT: 'Documento enviado',
  DOCUMENT_RESENT: 'E-mail reenviado',
  DOCUMENT_CANCELLED: 'Documento cancelado',
  DOCUMENT_ACCEPTED: 'Documento aceito',
  AMENDMENT_PROPOSED: 'Aditivo proposto',
  AMENDMENT_WITHDRAWN: 'Aditivo descartado',
  INTELLIGENCE_APPLIED: 'Inteligência aplicada pelo contrato',
  DESIGNATED_ADMIN_CHANGED: 'Administrador indicado alterado',
}

// Rótulo de cada campo que aparece no histórico. Campo sem rótulo aparece cru.
export const BILLING_FIELD_LABELS: Record<string, string> = {
  // Empresa
  name: 'Nome no sistema',
  cnpj: 'CNPJ',
  idProtheus: 'Código Protheus',
  // Cadastro
  legalName: 'Razão social',
  tradeName: 'Nome fantasia',
  stateRegistration: 'Inscrição estadual',
  addressStreet: 'Logradouro',
  addressNumber: 'Número',
  addressComplement: 'Complemento',
  addressDistrict: 'Bairro',
  addressCity: 'Cidade',
  addressState: 'UF',
  addressZip: 'CEP',
  legalRepName: 'Nome do representante',
  legalRepCpf: 'CPF do representante',
  legalRepRole: 'Cargo do representante',
  contactName: 'Nome do contato principal',
  contactEmail: 'E-mail do contato principal',
  contactPhone: 'Telefone do contato principal',
  billingContactName: 'Nome do contato de cobrança',
  billingEmail: 'E-mail de cobrança',
  billingPhone: 'Telefone de cobrança',
  notes: 'Observações',
  // Contrato
  packageId: 'Pacote',
  licenseType: 'Tipo de licença',
  includedSeats: 'Licenças incluídas',
  extraSeats: 'Licenças adicionais',
  packagePrice: 'Valor do pacote',
  extraSeatPrice: 'Preço do adicional',
  graceMonths: 'Carência',
  dueDay: 'Dia de vencimento',
  overdueBlockDays: 'Dias para suspender',
  reason: 'Observação',
  // Pacotes e regras
  code: 'Código',
  seats: 'Licenças',
  listPriceStandard: 'Preço Padrão',
  listPriceIntelligence: 'Preço Com Inteligência',
  listExtraSeatPriceStandard: 'Adicional Padrão',
  listExtraSeatPriceIntelligence: 'Adicional Com Inteligência',
  sortOrder: 'Ordem',
  active: 'Status',
  dueReminderDays: 'Lembrete antes do vencimento',
  notifyEmail: 'E-mail da Addere para os avisos',
}

export function billingFieldLabel(key: string): string {
  return BILLING_FIELD_LABELS[key] ?? key
}

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  STANDARD: 'Padrão',
  INTELLIGENCE: 'Com Inteligência',
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_ACCEPTANCE: 'Aguardando aceite',
  ACTIVE: 'Ativo',
  CANCELLED: 'Cancelado',
}

export const TERMS_STATUS_LABELS: Record<ContractTermsStatus, string> = {
  PROPOSED: 'Proposto',
  EFFECTIVE: 'Vigente',
  WITHDRAWN: 'Descartado',
}

const THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/
const PLAIN_NUMBER = /^(\d+(\.\d*)?|\.\d+)$/

/**
 * Valor em reais digitado na cobrança → número; vazio, inválido ou negativo →
 * null. Leitor próprio, e não o parseOfficialNumber da reconciliação, porque
 * aqui "1.800" é mil e oitocentos (ponto de milhar), não 1,80:
 * - com vírgula, formato brasileiro: tira os pontos e a vírgula vira ponto
 *   ("1.800,50" e "1800,5" = 1800.5);
 * - sem vírgula e só com grupos de milhar: os pontos são milhar ("1.800" = 1800;
 *   "12.345.678" = 12345678);
 * - fora isso, número simples ("1800"; "1.5" = 1.5; "1.80" = 1.8).
 */
export function parseMoneyInput(text: string): number | null {
  const s = text.trim().replace(/[R$\s]/g, '')
  if (!s) return null
  let normalized: string
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (THOUSANDS_ONLY.test(s)) normalized = s.replace(/\./g, '')
  else normalized = s
  // Sinal, expoente, hexadecimal e afins não passam: só dígitos e um ponto
  if (!PLAIN_NUMBER.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Dinheiro digitado ('1.800,00', '1.800', '95,5') → '1800.00'; vazio ou inválido → null */
export function moneyInputToApi(text: string): string | null {
  const n = parseMoneyInput(text)
  return n === null ? null : n.toFixed(2)
}

/** '1800.00' da API → '1.800,00' no campo; volta pelo moneyInputToApi sem perda */
export function moneyApiToInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Termos do contrato (a ficha recebe as datas como string ISO) ────────────

/** Termos que valem agora (EFFECTIVE); null antes do aceite */
export function currentTermsOf(
  contract: CompanyContractDto | null | undefined,
  now: Date
): ContractTermsDto | null {
  if (!contract) return null
  const terms = contract.terms.map((dto) => ({
    status: dto.status,
    version: dto.version,
    effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
    dto,
  }))
  return resolveCurrentTerms(terms, now)?.dto ?? null
}

/** A proposta em aberto (PROPOSED de maior versão), editada no rascunho */
export function proposedTermsOf(
  contract: CompanyContractDto | null | undefined
): ContractTermsDto | null {
  if (!contract) return null
  return (
    contract.terms
      .filter((t) => t.status === 'PROPOSED')
      .sort((a, b) => b.version - a.version)[0] ?? null
  )
}

// ─── Formulário do rascunho ──────────────────────────────────────────────────

/** Preços de tabela do pacote para o tipo de licença (só pré-preenchem o contrato) */
export function listPricesFor(
  pkg: LicensePackageDto,
  licenseType: LicenseType
): { packagePrice: string | null; extraSeatPrice: string | null } {
  return licenseType === 'INTELLIGENCE'
    ? {
        packagePrice: pkg.listPriceIntelligence,
        extraSeatPrice: pkg.listExtraSeatPriceIntelligence,
      }
    : { packagePrice: pkg.listPriceStandard, extraSeatPrice: pkg.listExtraSeatPriceStandard }
}

/** Total mensal ao vivo a partir do que está digitado; null se algum campo é inválido */
export function draftMonthlyTotal(input: {
  packagePrice: string
  extraSeats: string
  extraSeatPrice: string
}): string | null {
  const packagePrice = moneyInputToApi(input.packagePrice)
  const extraSeatPrice = moneyInputToApi(input.extraSeatPrice)
  if (packagePrice === null || extraSeatPrice === null) return null
  if (!/^\d+$/.test(input.extraSeats.trim())) return null
  return contractMonthlyTotal({
    packagePrice,
    extraSeats: Number(input.extraSeats),
    extraSeatPrice,
  })
}

/**
 * Prévia "se aceito hoje": 1ª competência cobrada e 1ª fatura. Valor fora da
 * faixa devolve null (a prévia some), sem deixar o RangeError escapar.
 */
export function acceptancePreview(
  input: { graceMonths: string; dueDay: string },
  now: Date
): { firstBilledCompetence: Date; firstDueDate: Date } | null {
  if (!/^\d+$/.test(input.graceMonths.trim()) || !/^\d+$/.test(input.dueDay.trim())) return null
  try {
    return computeBillingCalendar({
      acceptDate: now,
      graceMonths: Number(input.graceMonths),
      dueDay: Number(input.dueDay),
    })
  } catch {
    return null
  }
}

let todayFormatter: Intl.DateTimeFormat | null = null

/** Dia civil de hoje em São Paulo, 'DD/MM/AAAA' */
export function todayInSaoPaulo(now: Date): string {
  todayFormatter ??= new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return todayFormatter.format(now)
}
