// Contrato de Licença de Uso e aditivo (plano 014) — campos do modelo,
// preenchimento, renderização e validação, mais os DTOs. Puro: a API usa no
// envio e o painel usa na prévia ao vivo, então o texto sai igual nos dois.
// Testado em apps/api/src/modules/billing/__tests__/contract-template.test.ts.
//
// O hash do aceite cobre o Markdown preenchido (renderedBody), não o HTML: o
// renderizador pode mudar sem invalidar aceites, mas muda como documentos
// antigos aparecem. Quem mexer nele precisa manter o mesmo HTML para os corpos
// v1 (o teste com os textos reais de docs/billing/ ajuda a perceber).

import {
  moneyToCents,
  type ContractStatus,
  type LicenseRequestDto,
  type LicenseType,
  type SeatUsage,
} from './billing'

export type ContractDocumentKind = 'CONTRACT' | 'AMENDMENT'
export type ContractTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ContractDocumentStatus = 'SENT' | 'ACCEPTED' | 'CANCELLED'

export const CONTRACT_DOCUMENT_KIND_LABELS: Record<ContractDocumentKind, string> = {
  CONTRACT: 'Contrato de Licença de Uso',
  AMENDMENT: 'Aditivo ao Contrato de Licença de Uso',
}

// ─── Contratada ──────────────────────────────────────────────────────────────
// O encarregado é o mesmo do §8.8 do contrato e da seção 12 da Política de
// Privacidade do site (nome completo, decidido em 15/10/2026).

export const CONTRATADA = {
  razaoSocial: 'GH ENGENHARIA LTDA - ME',
  cnpj: '07.841.407/0001-90',
  endereco: 'Rua Débora da Silva Braga, 55, Bessa, João Pessoa/PB, CEP 58037-350',
  encarregado: 'Gustavo Henrique Palitot Costa',
  emailContato: 'contato@addere.com.br',
  emailSuporte: 'suporte@addere.com.br',
} as const

// ─── Campos ──────────────────────────────────────────────────────────────────
// Lista fechada de propósito: campo novo exige código (aqui e em
// buildContractFieldValues, na API) e texto juntos. Tirar um campo quebra a
// publicação de qualquer modelo que o use.

export type ContractFieldGroup =
  'contratada' | 'cliente' | 'licenca' | 'valores' | 'cobranca' | 'documento' | 'aditivo'

export const CONTRACT_FIELD_GROUP_LABELS: Record<ContractFieldGroup, string> = {
  contratada: 'Contratada (Addere)',
  cliente: 'Empresa Contratante',
  licenca: 'Licença',
  valores: 'Valores',
  cobranca: 'Cobrança',
  documento: 'Documento',
  aditivo: 'Aditivo',
}

interface ContractFieldDef {
  key: string
  group: ContractFieldGroup
  label: string
  kinds: readonly ContractDocumentKind[]
}

const BOTH = ['CONTRACT', 'AMENDMENT'] as const
const AMENDMENT_ONLY = ['AMENDMENT'] as const

export const CONTRACT_FIELDS = [
  { key: 'contratada.razaoSocial', group: 'contratada', label: 'Razão social', kinds: BOTH },
  { key: 'contratada.cnpj', group: 'contratada', label: 'CNPJ', kinds: BOTH },
  { key: 'contratada.endereco', group: 'contratada', label: 'Endereço', kinds: BOTH },
  {
    key: 'contratada.encarregado',
    group: 'contratada',
    label: 'Encarregado de dados',
    kinds: BOTH,
  },
  { key: 'contratada.emailContato', group: 'contratada', label: 'E-mail de contato', kinds: BOTH },
  { key: 'contratada.emailSuporte', group: 'contratada', label: 'E-mail de suporte', kinds: BOTH },

  { key: 'cliente.razaoSocial', group: 'cliente', label: 'Razão social', kinds: BOTH },
  { key: 'cliente.nomeFantasia', group: 'cliente', label: 'Nome fantasia', kinds: BOTH },
  { key: 'cliente.cnpj', group: 'cliente', label: 'CNPJ', kinds: BOTH },
  { key: 'cliente.endereco', group: 'cliente', label: 'Endereço completo', kinds: BOTH },
  {
    key: 'cliente.representanteNome',
    group: 'cliente',
    label: 'Nome do representante legal',
    kinds: BOTH,
  },
  {
    key: 'cliente.representanteCpf',
    group: 'cliente',
    label: 'CPF do representante legal',
    kinds: BOTH,
  },
  {
    key: 'cliente.representanteCargo',
    group: 'cliente',
    label: 'Cargo do representante legal',
    kinds: BOTH,
  },
  { key: 'cliente.emailCobranca', group: 'cliente', label: 'E-mail de cobrança', kinds: BOTH },
  {
    key: 'cliente.administradorNome',
    group: 'cliente',
    label: 'Nome do administrador indicado',
    kinds: BOTH,
  },
  {
    key: 'cliente.administradorEmail',
    group: 'cliente',
    label: 'E-mail do administrador indicado',
    kinds: BOTH,
  },

  { key: 'licenca.pacote', group: 'licenca', label: 'Pacote', kinds: BOTH },
  { key: 'licenca.tipo', group: 'licenca', label: 'Tipo de licença', kinds: BOTH },
  { key: 'licenca.quantidade', group: 'licenca', label: 'Licenças do pacote', kinds: BOTH },
  { key: 'licenca.adicionais', group: 'licenca', label: 'Licenças adicionais', kinds: BOTH },
  { key: 'licenca.total', group: 'licenca', label: 'Total de licenças', kinds: BOTH },
  { key: 'licenca.inteligencia', group: 'licenca', label: 'Camada de Inteligência', kinds: BOTH },

  { key: 'valores.pacote', group: 'valores', label: 'Valor do pacote', kinds: BOTH },
  {
    key: 'valores.pacoteExtenso',
    group: 'valores',
    label: 'Valor do pacote por extenso',
    kinds: BOTH,
  },
  { key: 'valores.adicional', group: 'valores', label: 'Valor da licença adicional', kinds: BOTH },
  {
    key: 'valores.adicionalExtenso',
    group: 'valores',
    label: 'Valor da licença adicional por extenso',
    kinds: BOTH,
  },
  { key: 'valores.mensal', group: 'valores', label: 'Total mensal', kinds: BOTH },
  {
    key: 'valores.mensalExtenso',
    group: 'valores',
    label: 'Total mensal por extenso',
    kinds: BOTH,
  },

  { key: 'cobranca.carenciaMeses', group: 'cobranca', label: 'Meses de carência', kinds: BOTH },
  { key: 'cobranca.diaVencimento', group: 'cobranca', label: 'Dia de vencimento', kinds: BOTH },
  {
    key: 'cobranca.diasParaSuspensao',
    group: 'cobranca',
    label: 'Dias de atraso para suspensão',
    kinds: BOTH,
  },

  { key: 'documento.dataEmissao', group: 'documento', label: 'Data de emissão', kinds: BOTH },
  { key: 'documento.versaoModelo', group: 'documento', label: 'Versão do modelo', kinds: BOTH },

  {
    key: 'aditivo.contratoAceitoEm',
    group: 'aditivo',
    label: 'Data do aceite do contrato',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.pacoteAnterior',
    group: 'aditivo',
    label: 'Pacote anterior',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.tipoAnterior',
    group: 'aditivo',
    label: 'Tipo de licença anterior',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.quantidadeAnterior',
    group: 'aditivo',
    label: 'Licenças do pacote, antes',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.adicionaisAnterior',
    group: 'aditivo',
    label: 'Licenças adicionais, antes',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.valorPacoteAnterior',
    group: 'aditivo',
    label: 'Valor do pacote, antes',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.valorAdicionalAnterior',
    group: 'aditivo',
    label: 'Valor da licença adicional, antes',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.mensalAnterior',
    group: 'aditivo',
    label: 'Total mensal, antes',
    kinds: AMENDMENT_ONLY,
  },
  {
    key: 'aditivo.valeAPartirDe',
    group: 'aditivo',
    label: 'Vale a partir de',
    kinds: AMENDMENT_ONLY,
  },
  { key: 'aditivo.motivo', group: 'aditivo', label: 'Motivo da alteração', kinds: AMENDMENT_ONLY },
] as const satisfies readonly ContractFieldDef[]

export type ContractFieldKey = (typeof CONTRACT_FIELDS)[number]['key']

const FIELD_BY_KEY: ReadonlyMap<string, ContractFieldDef> = new Map(
  CONTRACT_FIELDS.map((f) => [f.key, f])
)

export function isContractFieldKey(key: string): key is ContractFieldKey {
  return FIELD_BY_KEY.has(key)
}

export function contractFieldLabel(key: string): string {
  const field = FIELD_BY_KEY.get(key)
  return field ? `${CONTRACT_FIELD_GROUP_LABELS[field.group]} · ${field.label}` : key
}

// Como o tipo de licença aparece no texto: os nomes que o §3.6 do contrato usa
// (notas de renderização de docs/billing/contrato-licenca-de-uso-v1.md)
export const LICENSE_TYPE_CONTRACT_TEXT: Record<LicenseType, string> = {
  STANDARD: 'Padrão',
  INTELLIGENCE: 'Com Inteligência',
}

export const INTELLIGENCE_CONTRACT_TEXT: Record<LicenseType, string> = {
  STANDARD: 'Não incluída',
  INTELLIGENCE: 'Incluída',
}

// Valores fictícios e evidentes para a prévia do editor. A contratada é a
// própria Addere, com as constantes que o documento real imprime.
export const SAMPLE_CONTRACT_VALUES: Record<ContractFieldKey, string> = {
  'contratada.razaoSocial': CONTRATADA.razaoSocial,
  'contratada.cnpj': CONTRATADA.cnpj,
  'contratada.endereco': CONTRATADA.endereco,
  'contratada.encarregado': CONTRATADA.encarregado,
  'contratada.emailContato': CONTRATADA.emailContato,
  'contratada.emailSuporte': CONTRATADA.emailSuporte,
  'cliente.razaoSocial': 'Empresa Exemplo Ltda',
  'cliente.nomeFantasia': 'Exemplo',
  'cliente.cnpj': '00.000.000/0000-00',
  'cliente.endereco': 'Rua Exemplo, 100, Centro, Cidade Exemplo/UF, CEP 00000-000',
  'cliente.representanteNome': 'Nome do Representante',
  'cliente.representanteCpf': '000.000.000-00',
  'cliente.representanteCargo': 'Diretor',
  'cliente.emailCobranca': 'cobranca@example.com',
  'cliente.administradorNome': 'Nome do Administrador',
  'cliente.administradorEmail': 'administrador@example.com',
  'licenca.pacote': 'Pacote 10',
  'licenca.tipo': LICENSE_TYPE_CONTRACT_TEXT.STANDARD,
  'licenca.quantidade': '10',
  'licenca.adicionais': '0',
  'licenca.total': '10',
  'licenca.inteligencia': INTELLIGENCE_CONTRACT_TEXT.STANDARD,
  'valores.pacote': 'R$ 1.000,00',
  'valores.pacoteExtenso': 'mil reais',
  'valores.adicional': 'R$ 100,00',
  'valores.adicionalExtenso': 'cem reais',
  'valores.mensal': 'R$ 1.000,00',
  'valores.mensalExtenso': 'mil reais',
  'cobranca.carenciaMeses': '0',
  'cobranca.diaVencimento': '10',
  'cobranca.diasParaSuspensao': '15',
  'documento.dataEmissao': '01/01/2026',
  'documento.versaoModelo': '1',
  'aditivo.contratoAceitoEm': '01/01/2026',
  'aditivo.pacoteAnterior': 'Pacote 10',
  'aditivo.tipoAnterior': LICENSE_TYPE_CONTRACT_TEXT.STANDARD,
  'aditivo.quantidadeAnterior': '10',
  'aditivo.adicionaisAnterior': '0',
  'aditivo.valorPacoteAnterior': 'R$ 1.000,00',
  'aditivo.valorAdicionalAnterior': 'R$ 100,00',
  'aditivo.mensalAnterior': 'R$ 1.000,00',
  'aditivo.valeAPartirDe': '01/02/2026',
  'aditivo.motivo': 'Motivo de exemplo da alteração',
}

// ─── Corpo do modelo ─────────────────────────────────────────────────────────

/** CRLF e CR viram LF, e o texto sai sem espaço no começo e no fim */
export function normalizeTemplateBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim()
}

// Campo bem formado: {{grupo.campo}}, só letras dos dois lados do ponto
const FIELD_PATTERN = /\{\{([A-Za-z]+\.[A-Za-z]+)\}\}/g
const REVIEW_PATTERN = /\[\[[^[\]]*\]\]/g

export type TemplateIssueType =
  | 'EMPTY'
  | 'UNKNOWN_FIELD'
  | 'FIELD_NOT_ALLOWED_FOR_KIND'
  | 'REVIEW_MARKER'
  | 'MALFORMED_PLACEHOLDER'

export interface TemplateIssue {
  type: TemplateIssueType
  text: string
  line: number // 1 = primeira linha do corpo normalizado
}

/** O que impede publicar o modelo. Lista vazia = pode publicar. */
export function checkTemplateForPublish(kind: ContractDocumentKind, body: string): TemplateIssue[] {
  const normalized = normalizeTemplateBody(body)
  if (!normalized) return [{ type: 'EMPTY', text: '', line: 1 }]

  const issues: TemplateIssue[] = []
  normalized.split('\n').forEach((text, index) => {
    const line = index + 1

    for (const match of text.matchAll(FIELD_PATTERN)) {
      const field = FIELD_BY_KEY.get(match[1])
      if (!field) issues.push({ type: 'UNKNOWN_FIELD', text: match[0], line })
      else if (!field.kinds.includes(kind)) {
        issues.push({ type: 'FIELD_NOT_ALLOWED_FOR_KIND', text: match[0], line })
      }
    }
    const withoutFields = text.replace(FIELD_PATTERN, '')
    if (withoutFields.includes('{{') || withoutFields.includes('}}')) {
      issues.push({ type: 'MALFORMED_PLACEHOLDER', text: text.trim(), line })
    }

    // [[A DEFINIR]], [[REVISAR: …]] e qualquer [[ ou ]] solto
    for (const match of text.matchAll(REVIEW_PATTERN)) {
      issues.push({ type: 'REVIEW_MARKER', text: match[0], line })
    }
    const withoutMarkers = text.replace(REVIEW_PATTERN, '')
    if (withoutMarkers.includes('[[') || withoutMarkers.includes(']]')) {
      issues.push({ type: 'REVIEW_MARKER', text: text.trim(), line })
    }
  })
  return issues
}

export type ContractFieldValues = Partial<Record<string, string | null | undefined>>

/**
 * Troca cada {{grupo.campo}} pelo valor. O valor perde quebras de linha e os
 * caracteres * { } [ ] antes de entrar, para dado de cadastro não virar
 * marcação nem campo novo. Valor vazio e campo fora da lista vão para
 * `missing` (uma vez cada) e o marcador fica no texto.
 */
export function fillContractTemplate(
  body: string,
  values: ContractFieldValues
): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = normalizeTemplateBody(body).replace(FIELD_PATTERN, (marker, key: string) => {
    const raw = isContractFieldKey(key) ? values[key] : undefined
    const clean =
      typeof raw === 'string'
        ? raw
            .replace(/\r\n?|\n/g, ' ')
            .replace(/[*{}[\]]/g, '')
            .trim()
        : ''
    if (!clean) {
      if (!missing.includes(key)) missing.push(key)
      return marker
    }
    return clean
  })
  return { text, missing }
}

// ─── Renderização (Markdown restrito → HTML seguro) ─────────────────────────
// Escapa todo HTML antes de qualquer marcação; só gera h1 a h3, p, ul, ol (com
// start), li, hr e strong, sem id nem class. É por isso que o painel pode
// pôr a saída em dangerouslySetInnerHTML.

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text: string): string {
  // Asterisco sem par fica como está
  return escapeText(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'hr' }
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[][] }
  | { type: 'ol'; start: number; items: string[][] }

const HEADING = /^(#+)\s+(.*)$/
const BULLET = /^[-*] (.*)$/
const NUMBERED = /^(\d+)[.)] (.*)$/

export function renderContractMarkdown(markdown: string): string {
  const blocks: Block[] = []
  let current: Block | null = null
  const close = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of normalizeTemplateBody(markdown).split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      close()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      close()
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 3), text: heading[2] })
      continue
    }
    if (line === '---') {
      close()
      blocks.push({ type: 'hr' })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      if (current?.type !== 'ul') {
        close()
        current = { type: 'ul', items: [] }
      }
      current.items.push([bullet[1]])
      continue
    }
    const numbered = NUMBERED.exec(line)
    if (numbered) {
      if (current?.type !== 'ol') {
        close()
        current = { type: 'ol', start: Number(numbered[1]), items: [] }
      }
      current.items.push([numbered[2]])
      continue
    }
    // Linha indentada logo abaixo de um item continua o item
    if (/^\s/.test(line) && (current?.type === 'ul' || current?.type === 'ol')) {
      current.items[current.items.length - 1].push(line.trim())
      continue
    }
    if (current?.type !== 'p') {
      close()
      current = { type: 'p', lines: [] }
    }
    current.lines.push(line.trim())
  }
  close()

  const li = (item: string[]) => `<li>${inline(item.join(' '))}</li>`
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
          return `<h${block.level}>${inline(block.text)}</h${block.level}>`
        case 'hr':
          return '<hr>'
        case 'p':
          return `<p>${inline(block.lines.join(' '))}</p>`
        case 'ul':
          return `<ul>\n${block.items.map(li).join('\n')}\n</ul>`
        case 'ol':
          return `<ol start="${block.start}">\n${block.items.map(li).join('\n')}\n</ol>`
      }
    })
    .join('\n')
}

// ─── Formatação de documento ─────────────────────────────────────────────────

/** 14 dígitos → 00.000.000/0000-00; outro formato sai como veio, sem espaços nas pontas */
export function formatCnpj(value: string): string {
  const digits = value.replace(/[.\-/\s]/g, '')
  if (!/^\d{14}$/.test(digits)) return value.trim()
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

/** 11 dígitos → 000.000.000-00; outro formato sai como veio, sem espaços nas pontas */
export function formatCpf(value: string): string {
  const digits = value.replace(/[.\-\s]/g, '')
  if (!/^\d{11}$/.test(digits)) return value.trim()
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

// ─── Aditivo: aumento de preço e antecedência ────────────────────────────────
// Puro para o painel avisar enquanto o superadmin preenche; a API confere de
// novo no envio (amendment-rules.ts). Contrato §13 e aditivo §3.3.

export const AMENDMENT_NOTICE_DAYS = 30

interface PriceTerms {
  packagePrice: string
  extraSeatPrice: string
}

/**
 * Aumento de preço: sobe o valor do pacote, sobe o valor unitário da licença
 * adicional, ou leva às condições gerais novas. Mais licenças adicionais pelo
 * mesmo valor unitário aumentam o total mensal, mas não são aumento de preço.
 */
export function isPriceIncrease(
  previous: PriceTerms,
  proposed: PriceTerms,
  carryConditions: boolean
): boolean {
  return (
    carryConditions ||
    moneyToCents(proposed.packagePrice) > moneyToCents(previous.packagePrice) ||
    moneyToCents(proposed.extraSeatPrice) > moneyToCents(previous.extraSeatPrice)
  )
}

/** @db.Date (meia-noite UTC) → 'AAAA-MM-DD' */
export function civilYmd(day: Date): string {
  const month = String(day.getUTCMonth() + 1).padStart(2, '0')
  return `${day.getUTCFullYear()}-${month}-${String(day.getUTCDate()).padStart(2, '0')}`
}

/** 'AAAA-MM-DD' + 30 dias corridos, em 'AAAA-MM-DD' */
export function minimumEffectiveDate(sentYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sentYmd)
  if (!m) throw new RangeError(`data inválida: ${sentYmd}`)
  const day = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + AMENDMENT_NOTICE_DAYS)
  )
  return civilYmd(day)
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
export function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-')
  return `${day}/${month}/${year}`
}

// ─── DTOs ────────────────────────────────────────────────────────────────────
// Datas como string ISO; dinheiro como string '1234.56'.

export interface ContractTemplateSummaryDto {
  id: string
  kind: ContractDocumentKind
  version: number
  status: ContractTemplateStatus
  changeNote: string | null
  createdByName: string | null // null = gravado pela migration
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publishedByName: string | null
}

export interface ContractTemplateDto extends ContractTemplateSummaryDto {
  body: string
}

export interface TemplatePreviewDto {
  renderedBody: string // Markdown preenchido
  missing: string[]
  issues: TemplateIssue[]
}

export interface ContractDocumentSummaryDto {
  id: string
  kind: ContractDocumentKind
  status: ContractDocumentStatus
  companyId: string
  templateVersion: number
  conditionsVersion: number | null // versão das condições gerais que o documento carrega
  termsVersion: number
  sha256: string
  sentAt: string
  sentByName: string | null
  lastEmailAt: string | null
  acceptedAt: string | null
  acceptedByName: string | null
  acceptedByEmail: string | null
  acceptedIp: string | null
  acceptedUserAgent: string | null
  cancelledAt: string | null
  cancelReason: string | null
}

export interface ContractDocumentDto extends ContractDocumentSummaryDto {
  renderedBody: string // Markdown preenchido; é sobre ele que o SHA-256 é calculado
}

/** Administrador indicado; `valid` = ainda é ADMIN ativo da empresa */
export interface DesignatedAdminRef {
  id: string
  name: string
  valid: boolean
}

export interface PendingDocumentRef {
  id: string
  kind: ContractDocumentKind
  sentAt: string
  designatedAdmin: DesignatedAdminRef | null
}

export interface AdminCandidateDto {
  id: string
  name: string
  email: string
}

/** GET /admin/billing/clients/:companyId/documents */
export interface ClientDocumentsDto {
  documents: ContractDocumentSummaryDto[] // mais novo primeiro
  conditions: { acceptedVersion: number | null; latestPublishedVersion: number | null }
  activePilot: boolean
  designatedAdmin: (DesignatedAdminRef & { email: string }) | null
  adminCandidates: AdminCandidateDto[]
  // O aditivo proposto, com o que não está no ContractTermsDto do 013
  amendment: {
    termsId: string
    version: number
    requestedByClient: boolean
    proposedEffectiveFrom: string | null // 'AAAA-MM-DD'
  } | null
}

/** POST /admin/billing/clients/:companyId/documents/preview */
export interface DocumentPreviewDto {
  kind: ContractDocumentKind
  templateVersion: number
  renderedBody: string
  missing: string[]
  priceIncrease: boolean
  minimumEffectiveFrom: string | null // 'AAAA-MM-DD' quando a antecedência é exigida
}

export interface DocumentSendResultDto {
  document: ContractDocumentSummaryDto
  emailSent: boolean
}

export interface AmendmentInput {
  packageId: string
  licenseType: LicenseType
  includedSeats?: number
  extraSeats: number
  packagePrice: string
  extraSeatPrice: string
  proposedEffectiveFrom?: string | null // 'AAAA-MM-DD'
  reason: string
  requestedByClient: boolean
  carryConditions?: boolean // só para conferir a antecedência; o envio recebe de novo
}

export interface MyTermsDto {
  packageCode: string
  packageName: string
  licenseType: LicenseType
  includedSeats: number
  extraSeats: number
  packagePrice: string
  extraSeatPrice: string
  monthlyTotal: string
  effectiveFrom: string
}

/** GET /billing/me — o 015 acrescenta seats e licenseRequests */
export interface MyBillingDto {
  contract: {
    status: ContractStatus
    startDate: string | null // @db.Date
    graceMonths: number
    firstBilledCompetence: string | null // @db.Date
    dueDay: number
  } | null
  currentTerms: MyTermsDto | null
  scheduledTerms: MyTermsDto | null // aceito, com effectiveFrom no futuro
  pendingDocument: PendingDocumentRef | null
  designatedAdmin: DesignatedAdminRef | null
  // Plano 015: só vêm quando o cliente vê um contrato (sem contrato ou em
  // rascunho, a resposta é a do 014, com as cinco chaves acima)
  seats?: SeatUsage
  licenseRequests?: LicenseRequestDto[] // os 20 mais recentes da empresa
}

/** GET /billing/me/documents */
export interface MyDocumentsDto {
  pending: ContractDocumentDto | null
  accepted: ContractDocumentSummaryDto[]
}
