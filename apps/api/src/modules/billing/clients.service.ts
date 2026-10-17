import { prisma } from '@addere/db'
import type { ClientProfile, Prisma } from '@prisma/client'
import {
  contractMonthlyTotal,
  deriveClientStatus,
  resolveCurrentTerms,
  type BillingEventDto,
  type BillingEventType,
  type ClientDetailDto,
  type ClientListItemDto,
  type ClientProfileDto,
  type CompanyContractDto,
  type ContractTermsDto,
} from '@addere/types'
import { conflict, notFound } from '../../lib/errors'
import { changedFields, isUniqueViolation, recordBillingEvent } from './billing-events'
import type { ClientData, ClientProfileData } from './billing.schema'
import { moneyToString } from './catalog.service'
import { dateToIsoDay } from './competence'

// Cadastro comercial do cliente (plano 013). LGPD: a lista não devolve
// representante nem contatos; só a ficha devolve, e só ao SUPERADMIN.

// Select explícito: nenhuma credencial do Protheus sai daqui (o listCompanies
// usa include e devolve a linha inteira, inclusive o passProtheus).
const COMPANY_SELECT = {
  id: true,
  name: true,
  cnpj: true,
  idProtheus: true,
  active: true,
  createdAt: true,
} satisfies Prisma.CompanySelect

export const COMPANY_KEYS = ['name', 'cnpj', 'idProtheus'] as const
export const PROFILE_KEYS = [
  'legalName',
  'tradeName',
  'stateRegistration',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressDistrict',
  'addressCity',
  'addressState',
  'addressZip',
  'legalRepName',
  'legalRepCpf',
  'legalRepRole',
  'contactName',
  'contactEmail',
  'contactPhone',
  'billingContactName',
  'billingEmail',
  'billingPhone',
  'notes',
] as const

// Termos com o pacote e o autor — a forma que a ficha e o PUT do contrato devolvem
export const CONTRACT_WITH_TERMS = {
  terms: {
    orderBy: { version: 'desc' },
    include: {
      package: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
    },
  },
} satisfies Prisma.CompanyContractInclude

type ContractWithTerms = Prisma.CompanyContractGetPayload<{ include: typeof CONTRACT_WITH_TERMS }>
type TermsWithRefs = ContractWithTerms['terms'][number]

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

function termsTotals(t: {
  packagePrice: Prisma.Decimal
  extraSeats: number
  extraSeatPrice: Prisma.Decimal
}) {
  const packagePrice = moneyToString(t.packagePrice)
  const extraSeatPrice = moneyToString(t.extraSeatPrice)
  return {
    packagePrice,
    extraSeatPrice,
    monthlyTotal: contractMonthlyTotal({ packagePrice, extraSeats: t.extraSeats, extraSeatPrice }),
  }
}

function toTermsDto(t: TermsWithRefs): ContractTermsDto {
  return {
    id: t.id,
    version: t.version,
    status: t.status,
    origin: t.origin,
    proposedEffectiveFrom: iso(t.proposedEffectiveFrom),
    effectiveFrom: iso(t.effectiveFrom),
    packageId: t.packageId,
    packageCode: t.package.code,
    packageName: t.package.name,
    licenseType: t.licenseType,
    includedSeats: t.includedSeats,
    extraSeats: t.extraSeats,
    ...termsTotals(t),
    reason: t.reason,
    createdByName: t.createdBy?.name ?? null,
    createdAt: t.createdAt.toISOString(),
  }
}

export function toContractDto(c: ContractWithTerms): CompanyContractDto {
  return {
    id: c.id,
    status: c.status,
    startDate: iso(c.startDate),
    graceMonths: c.graceMonths,
    firstBilledCompetence: iso(c.firstBilledCompetence),
    dueDay: c.dueDay,
    overdueBlockDays: c.overdueBlockDays,
    terms: c.terms.map(toTermsDto),
    // Encerramento (plano 016): o fim é dia civil e viaja como 'YYYY-MM-DD'
    endsAt: c.endsAt ? dateToIsoDay(c.endsAt) : null,
    cancelRequestedAt: iso(c.cancelRequestedAt),
    cancelReason: c.cancelReason,
    deactivateCompanyOnEnd: c.deactivateCompanyOnEnd,
  }
}

function toProfileDto(p: ClientProfile): ClientProfileDto {
  return {
    companyId: p.companyId,
    legalName: p.legalName,
    tradeName: p.tradeName,
    stateRegistration: p.stateRegistration,
    addressStreet: p.addressStreet,
    addressNumber: p.addressNumber,
    addressComplement: p.addressComplement,
    addressDistrict: p.addressDistrict,
    addressCity: p.addressCity,
    addressState: p.addressState,
    addressZip: p.addressZip,
    legalRepName: p.legalRepName,
    legalRepCpf: p.legalRepCpf,
    legalRepRole: p.legalRepRole,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    contactPhone: p.contactPhone,
    billingContactName: p.billingContactName,
    billingEmail: p.billingEmail,
    billingPhone: p.billingPhone,
    notes: p.notes,
  }
}

// Licenças em uso: vendedores e gerentes ativos (SALESPERSON). ADMIN é grátis.
async function usedSeatsByCompany(): Promise<Map<string, number>> {
  const rows = await prisma.user.groupBy({
    by: ['companyId'],
    where: { role: 'SALESPERSON', active: true, companyId: { not: null } },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.companyId as string, r._count._all]))
}

function contractStatusInput(
  contract: {
    status: CompanyContractDto['status']
    graceMonths: number
    firstBilledCompetence: Date | null
  } | null
) {
  return contract
    ? {
        status: contract.status,
        graceMonths: contract.graceMonths,
        firstBilledCompetence: contract.firstBilledCompetence,
      }
    : null
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export async function listClients(now: Date): Promise<ClientListItemDto[]> {
  const [companies, used] = await Promise.all([
    prisma.company.findMany({
      select: {
        ...COMPANY_SELECT,
        // Do cadastro, só os nomes: nenhum dado pessoal sai na lista
        clientProfile: { select: { legalName: true, tradeName: true } },
        contract: {
          select: {
            status: true,
            graceMonths: true,
            firstBilledCompetence: true,
            terms: {
              where: { status: { in: ['PROPOSED', 'EFFECTIVE'] } },
              select: {
                version: true,
                status: true,
                effectiveFrom: true,
                licenseType: true,
                includedSeats: true,
                extraSeats: true,
                packagePrice: true,
                extraSeatPrice: true,
                package: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    usedSeatsByCompany(),
  ])

  return companies.map((c) => {
    const terms = c.contract?.terms ?? []
    const current = resolveCurrentTerms(terms, now)
    const proposed =
      terms.filter((t) => t.status === 'PROPOSED').sort((a, b) => b.version - a.version)[0] ?? null
    return {
      id: c.id,
      name: c.name,
      cnpj: c.cnpj,
      idProtheus: c.idProtheus,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
      legalName: c.clientProfile?.legalName ?? null,
      tradeName: c.clientProfile?.tradeName ?? null,
      status: deriveClientStatus({ contract: contractStatusInput(c.contract), now }),
      contractStatus: c.contract?.status ?? null,
      current: current
        ? {
            packageName: current.package.name,
            licenseType: current.licenseType,
            seatLimit: current.includedSeats + current.extraSeats,
            monthlyTotal: termsTotals(current).monthlyTotal,
          }
        : null,
      proposed: proposed
        ? { packageName: proposed.package.name, licenseType: proposed.licenseType }
        : null,
      usedSeats: used.get(c.id) ?? 0,
    }
  })
}

// ─── Ficha ───────────────────────────────────────────────────────────────────

export async function getClient(companyId: string, now: Date): Promise<ClientDetailDto> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      ...COMPANY_SELECT,
      clientProfile: true,
      contract: { include: CONTRACT_WITH_TERMS },
    },
  })
  if (!company) throw notFound('Cliente não encontrado')

  const usedSeats = await prisma.user.count({
    where: { companyId, role: 'SALESPERSON', active: true },
  })
  const current = resolveCurrentTerms(company.contract?.terms ?? [], now)

  return {
    company: {
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      idProtheus: company.idProtheus,
      active: company.active,
      createdAt: company.createdAt.toISOString(),
    },
    profile: company.clientProfile ? toProfileDto(company.clientProfile) : null,
    contract: company.contract ? toContractDto(company.contract) : null,
    status: deriveClientStatus({ contract: contractStatusInput(company.contract), now }),
    usedSeats,
    seatLimit: current ? current.includedSeats + current.extraSeats : null,
  }
}

// Cria o cadastro na mesma transação da empresa (POST /companies)
export async function createClientProfile(
  tx: Prisma.TransactionClient,
  companyId: string,
  profile: ClientProfileData
): Promise<void> {
  await tx.clientProfile.create({ data: { companyId, ...profile } })
}

export async function updateClient(
  companyId: string,
  input: ClientData,
  actorId: string
): Promise<ClientDetailDto> {
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.company.findUnique({
        where: { id: companyId },
        select: { name: true, cnpj: true, idProtheus: true, clientProfile: true },
      })
      if (!before) throw notFound('Cliente não encontrado')

      await tx.company.update({
        where: { id: companyId },
        data: { name: input.name, cnpj: input.cnpj, idProtheus: input.idProtheus },
      })
      // Empresa criada antes do plano 013 não tem cadastro: o upsert o cria
      await tx.clientProfile.upsert({
        where: { companyId },
        create: { companyId, ...input.profile },
        update: input.profile,
      })

      const fields = [
        ...changedFields(before, input, COMPANY_KEYS),
        ...changedFields(before.clientProfile, input.profile, PROFILE_KEYS),
      ]
      if (fields.length > 0) {
        await recordBillingEvent(tx, { type: 'CLIENT_UPDATED', companyId, actorId, fields })
      }
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('Já existe uma empresa com este CNPJ', 'CNPJ_TAKEN')
    }
    throw err
  }
  return getClient(companyId, new Date())
}

// ─── Histórico ───────────────────────────────────────────────────────────────

function payloadFields(payload: Prisma.JsonValue): string[] {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const fields = (payload as Prisma.JsonObject).fields
    if (Array.isArray(fields)) return fields.filter((f): f is string => typeof f === 'string')
  }
  return []
}

export async function listClientEvents(companyId: string): Promise<BillingEventDto[]> {
  const events = await prisma.billingEvent.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actor: { select: { name: true } } },
  })
  return events.map((e) => ({
    id: e.id,
    type: e.type as BillingEventType,
    actorName: e.actor?.name ?? null,
    fields: payloadFields(e.payload),
    createdAt: e.createdAt.toISOString(),
  }))
}
