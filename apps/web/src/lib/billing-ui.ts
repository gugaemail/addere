// Gestão Addere (plano 013) — rótulos, cores e conversão de dinheiro do painel.
// Puro e testado em __tests__/billing-ui.test.ts; as telas não têm teste de render.
import type {
  BillingEventType,
  ClientStatus,
  ContractStatus,
  ContractTermsStatus,
  LicenseType,
} from '@addere/types'
import { parseOfficialNumber } from './reconciliation'

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

/** Dinheiro digitado ('1.800,00', '95,5', '1800.00') → '1800.00'; vazio ou inválido → null */
export function moneyInputToApi(text: string): string | null {
  const n = parseOfficialNumber(text, 'currency')
  if (n === null || n < 0) return null
  return n.toFixed(2)
}

/** '1800.00' da API → '1.800,00' no campo; volta pelo moneyInputToApi sem perda */
export function moneyApiToInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
