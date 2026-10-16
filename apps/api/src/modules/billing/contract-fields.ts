import type { Prisma } from '@prisma/client'
import {
  CONTRATADA,
  INTELLIGENCE_CONTRACT_TEXT,
  LICENSE_TYPE_CONTRACT_TEXT,
  civilDaySaoPaulo,
  contractMonthlyTotal,
  formatBillingDate,
  formatBrl,
  formatCnpj,
  formatCpf,
  moneyToCents,
  reaisPorExtenso,
  resolveCurrentTerms,
  type ContractDocumentKind,
  type ContractFieldKey,
  type LicenseType,
} from '@addere/types'

// Valores dos campos do Contrato de Licença de Uso e do aditivo (plano 014).
// buildContractFieldValues é pura (testada em contract-fields.test.ts);
// loadContractFieldInput faz as consultas. Campo sem dado vale null, e null
// vira "campo sem dado" no envio (CONTRACT_FIELDS_MISSING).

export interface TermsForFields {
  id: string
  version: number
  licenseType: LicenseType
  includedSeats: number
  extraSeats: number
  packagePrice: Prisma.Decimal
  extraSeatPrice: Prisma.Decimal
  proposedEffectiveFrom: Date | null
  reason: string | null
  requestedByClient: boolean
  package: { name: string }
}

export interface ContractFieldInput {
  kind: ContractDocumentKind
  company: { cnpj: string }
  profile: {
    legalName: string
    tradeName: string | null
    addressStreet: string | null
    addressNumber: string | null
    addressComplement: string | null
    addressDistrict: string | null
    addressCity: string | null
    addressState: string | null
    addressZip: string | null
    legalRepName: string | null
    legalRepCpf: string | null
    legalRepRole: string | null
    billingEmail: string | null
  } | null
  contract: { graceMonths: number; dueDay: number; overdueBlockDays: number | null } | null
  designatedAdmin: { id: string; name: string; email: string } | null
  terms: TermsForFields | null // os termos que o documento leva (no aditivo, os propostos)
  previousTerms: TermsForFields | null // aditivo: os termos EFFECTIVE de maior effectiveFrom
  acceptedContractAt: Date | null // aditivo: o aceite do CONTRACT original
  template: { version: number }
  settings: { overdueBlockDays: number } | null
  issuedAt: Date // o envio; na prévia, agora
}

/** Texto vazio ou só espaços vale null */
function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const money = (d: Prisma.Decimal) => d.toFixed(2)
const civilDate = (instant: Date) => formatBillingDate(civilDaySaoPaulo(instant))

/** Logradouro, número[, complemento], bairro, Cidade/UF, CEP 00000-000; faltou parte ⇒ null */
export function formatClientAddress(p: ContractFieldInput['profile']): string | null {
  if (!p) return null
  const street = text(p.addressStreet)
  const number = text(p.addressNumber)
  const district = text(p.addressDistrict)
  const city = text(p.addressCity)
  const state = text(p.addressState)
  const zip = text(p.addressZip)
  if (!street || !number || !district || !city || !state || !zip) return null
  const digits = zip.replace(/\D/g, '')
  const cep = digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : zip
  const complement = text(p.addressComplement)
  return [
    street,
    number,
    ...(complement ? [complement] : []),
    district,
    `${city}/${state}`,
    `CEP ${cep}`,
  ].join(', ')
}

function termsValues(t: TermsForFields | null) {
  if (!t) {
    return {
      pacote: null,
      tipo: null,
      quantidade: null,
      adicionais: null,
      total: null,
      inteligencia: null,
      valorPacote: null,
      valorPacoteExtenso: null,
      valorAdicional: null,
      valorAdicionalExtenso: null,
      mensal: null,
      mensalExtenso: null,
    }
  }
  const packagePrice = money(t.packagePrice)
  const extraSeatPrice = money(t.extraSeatPrice)
  const monthly = contractMonthlyTotal({ packagePrice, extraSeats: t.extraSeats, extraSeatPrice })
  return {
    pacote: text(t.package.name),
    tipo: LICENSE_TYPE_CONTRACT_TEXT[t.licenseType],
    quantidade: String(t.includedSeats),
    adicionais: String(t.extraSeats),
    total: String(t.includedSeats + t.extraSeats),
    inteligencia: INTELLIGENCE_CONTRACT_TEXT[t.licenseType],
    valorPacote: formatBrl(packagePrice),
    valorPacoteExtenso: reaisPorExtenso(moneyToCents(packagePrice)),
    valorAdicional: formatBrl(extraSeatPrice),
    valorAdicionalExtenso: reaisPorExtenso(moneyToCents(extraSeatPrice)),
    mensal: formatBrl(monthly),
    mensalExtenso: reaisPorExtenso(moneyToCents(monthly)),
  }
}

export function buildContractFieldValues(
  input: ContractFieldInput
): Record<ContractFieldKey, string | null> {
  const { profile, contract, designatedAdmin, terms } = input
  const now = termsValues(terms)
  const issued = civilDate(input.issuedAt)
  const amendment = input.kind === 'AMENDMENT'
  const before = termsValues(amendment ? input.previousTerms : null)
  const suspensionDays = contract?.overdueBlockDays ?? input.settings?.overdueBlockDays ?? null
  const cnpj = text(input.company.cnpj)
  const cpf = text(profile?.legalRepCpf)

  return {
    'contratada.razaoSocial': CONTRATADA.razaoSocial,
    'contratada.cnpj': CONTRATADA.cnpj,
    'contratada.endereco': CONTRATADA.endereco,
    'contratada.encarregado': CONTRATADA.encarregado,
    'contratada.emailContato': CONTRATADA.emailContato,
    'contratada.emailSuporte': CONTRATADA.emailSuporte,

    'cliente.razaoSocial': text(profile?.legalName),
    // Única reserva: muita empresa não tem nome fantasia (revisão de 15/10/2026)
    'cliente.nomeFantasia': text(profile?.tradeName) ?? text(profile?.legalName),
    'cliente.cnpj': cnpj ? formatCnpj(cnpj) : null,
    'cliente.endereco': formatClientAddress(profile),
    'cliente.representanteNome': text(profile?.legalRepName),
    'cliente.representanteCpf': cpf ? formatCpf(cpf) : null,
    'cliente.representanteCargo': text(profile?.legalRepRole),
    'cliente.emailCobranca': text(profile?.billingEmail),
    // Lido na hora de gerar o texto; quem confere se ainda é ADMIN ativo é o envio
    'cliente.administradorNome': text(designatedAdmin?.name),
    'cliente.administradorEmail': text(designatedAdmin?.email),

    'licenca.pacote': now.pacote,
    'licenca.tipo': now.tipo,
    'licenca.quantidade': now.quantidade,
    'licenca.adicionais': now.adicionais,
    'licenca.total': now.total,
    'licenca.inteligencia': now.inteligencia,

    'valores.pacote': now.valorPacote,
    'valores.pacoteExtenso': now.valorPacoteExtenso,
    'valores.adicional': now.valorAdicional,
    'valores.adicionalExtenso': now.valorAdicionalExtenso,
    'valores.mensal': now.mensal,
    'valores.mensalExtenso': now.mensalExtenso,

    'cobranca.carenciaMeses': contract ? String(contract.graceMonths) : null,
    'cobranca.diaVencimento': contract ? String(contract.dueDay) : null,
    'cobranca.diasParaSuspensao': suspensionDays === null ? null : String(suspensionDays),

    'documento.dataEmissao': issued,
    'documento.versaoModelo': String(input.template.version),

    // Num CONTRACT, os aditivo.* não são preenchidos
    'aditivo.contratoAceitoEm':
      amendment && input.acceptedContractAt ? civilDate(input.acceptedContractAt) : null,
    'aditivo.pacoteAnterior': before.pacote,
    'aditivo.tipoAnterior': before.tipo,
    'aditivo.quantidadeAnterior': before.quantidade,
    'aditivo.adicionaisAnterior': before.adicionais,
    'aditivo.valorPacoteAnterior': before.valorPacote,
    'aditivo.valorAdicionalAnterior': before.valorAdicional,
    'aditivo.mensalAnterior': before.mensal,
    // Nunca vazio (notas da minuta do aditivo): sem data, a emissão, e o "o que
    // for posterior" do §3.1 leva ao aceite
    'aditivo.valeAPartirDe': amendment
      ? terms?.proposedEffectiveFrom
        ? civilDate(terms.proposedEffectiveFrom)
        : issued
      : null,
    'aditivo.motivo': amendment ? text(terms?.reason) : null,
  }
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export const TERMS_FOR_FIELDS = {
  id: true,
  version: true,
  status: true,
  origin: true,
  effectiveFrom: true,
  licenseType: true,
  includedSeats: true,
  extraSeats: true,
  packagePrice: true,
  extraSeatPrice: true,
  proposedEffectiveFrom: true,
  reason: true,
  requestedByClient: true,
  package: { select: { name: true } },
} satisfies Prisma.ContractTermsSelect

type TermsRow = Prisma.ContractTermsGetPayload<{ select: typeof TERMS_FOR_FIELDS }>

const latestProposed = (terms: TermsRow[], origin: TermsRow['origin']): TermsRow | null =>
  terms
    .filter((t) => t.status === 'PROPOSED' && t.origin === origin)
    .sort((a, b) => b.version - a.version)[0] ?? null

/** Os termos EFFECTIVE de maior effectiveFrom (os anteriores de um aditivo) */
export function latestEffectiveTerms<
  T extends { status: string; effectiveFrom: Date | null; version: number },
>(terms: readonly T[]): T | null {
  let best: T | null = null
  for (const t of terms) {
    if (t.status !== 'EFFECTIVE' || !t.effectiveFrom) continue
    const time = t.effectiveFrom.getTime()
    const bestTime = best?.effectiveFrom?.getTime() ?? -Infinity
    if (time > bestTime || (time === bestTime && best && t.version > best.version)) best = t
  }
  return best
}

/**
 * Carrega o que buildContractFieldValues precisa. Termos: num CONTRACT, o
 * PROPOSED de origem CONTRACT (na prévia de um contrato já ativo, os atuais);
 * num AMENDMENT, o PROPOSED de origem AMENDMENT, e os anteriores são os
 * EFFECTIVE de maior effectiveFrom.
 */
export async function loadContractFieldInput(
  db: Prisma.TransactionClient,
  companyId: string,
  kind: ContractDocumentKind,
  template: { version: number },
  now: Date
): Promise<ContractFieldInput | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      cnpj: true,
      clientProfile: true,
      contract: {
        select: {
          id: true,
          graceMonths: true,
          dueDay: true,
          overdueBlockDays: true,
          designatedAdmin: { select: { id: true, name: true, email: true } },
          terms: { select: TERMS_FOR_FIELDS },
        },
      },
    },
  })
  if (!company) return null

  const [settings, acceptedContract] = await Promise.all([
    db.billingSettings.findUnique({ where: { id: 'global' }, select: { overdueBlockDays: true } }),
    kind === 'AMENDMENT' && company.contract
      ? db.contractDocument.findFirst({
          where: { contractId: company.contract.id, kind: 'CONTRACT', status: 'ACCEPTED' },
          orderBy: { acceptedAt: 'asc' },
          select: { acceptedAt: true },
        })
      : Promise.resolve(null),
  ])

  const allTerms = company.contract?.terms ?? []
  const terms =
    kind === 'CONTRACT'
      ? (latestProposed(allTerms, 'CONTRACT') ?? resolveCurrentTerms(allTerms, now))
      : latestProposed(allTerms, 'AMENDMENT')

  return {
    kind,
    company: { cnpj: company.cnpj },
    profile: company.clientProfile,
    contract: company.contract,
    designatedAdmin: company.contract?.designatedAdmin ?? null,
    terms,
    previousTerms: kind === 'AMENDMENT' ? latestEffectiveTerms(allTerms) : null,
    acceptedContractAt: acceptedContract?.acceptedAt ?? null,
    template,
    settings,
    issuedAt: now,
  }
}
