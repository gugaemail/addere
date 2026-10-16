import { prisma } from '@addere/db'
import { Prisma } from '@prisma/client'
import type { BillingSettings, LicensePackage } from '@prisma/client'
import type { BillingSettingsDto, LicensePackageDto } from '@addere/types'
import { conflict, notFound } from '../../lib/errors'
import { changedFields, isUniqueViolation, recordBillingEvent } from './billing-events'
import type { PackageCreateData, PackageUpdateData, SettingsData } from './billing.schema'

// Catálogo de pacotes e regras globais de cobrança (plano 013). Só o
// SUPERADMIN chega aqui (billing.routes.ts).

const PACKAGE_PRICE_KEYS = [
  'listPriceStandard',
  'listPriceIntelligence',
  'listExtraSeatPriceStandard',
  'listExtraSeatPriceIntelligence',
] as const
const PACKAGE_KEYS = ['name', 'seats', ...PACKAGE_PRICE_KEYS, 'sortOrder'] as const
const SETTINGS_KEYS = ['overdueBlockDays', 'dueReminderDays', 'notifyEmail'] as const

const SETTINGS_ID = 'global'

// Decimal → '1234.56'. Não confie no toJSON do Decimal, que devolve '1800'.
export function moneyToString(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2)
}

function moneyOrNull(value: Prisma.Decimal | string | number | null): string | null {
  return value === null ? null : moneyToString(value)
}

function toPackageDto(p: LicensePackage): LicensePackageDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    seats: p.seats,
    listPriceStandard: moneyOrNull(p.listPriceStandard),
    listPriceIntelligence: moneyOrNull(p.listPriceIntelligence),
    listExtraSeatPriceStandard: moneyOrNull(p.listExtraSeatPriceStandard),
    listExtraSeatPriceIntelligence: moneyOrNull(p.listExtraSeatPriceIntelligence),
    active: p.active,
    sortOrder: p.sortOrder,
  }
}

function toSettingsDto(s: BillingSettings): BillingSettingsDto {
  return {
    overdueBlockDays: s.overdueBlockDays,
    dueReminderDays: s.dueReminderDays,
    autoBlockEnabled: s.autoBlockEnabled,
    notifyEmail: s.notifyEmail,
    updatedAt: s.updatedAt.toISOString(),
  }
}

// ─── Pacotes ─────────────────────────────────────────────────────────────────

export async function listPackages(): Promise<LicensePackageDto[]> {
  const packages = await prisma.licensePackage.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return packages.map(toPackageDto)
}

export async function createPackage(
  input: PackageCreateData,
  actorId: string
): Promise<LicensePackageDto> {
  try {
    return await prisma.$transaction(async (tx) => {
      const pkg = await tx.licensePackage.create({ data: input })
      await recordBillingEvent(tx, {
        type: 'PACKAGE_CREATED',
        companyId: null,
        actorId,
        fields: changedFields(null, input, ['code', ...PACKAGE_KEYS], PACKAGE_PRICE_KEYS),
        ref: { packageCode: pkg.code },
      })
      return toPackageDto(pkg)
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict('Já existe um pacote com este código', 'PACKAGE_CODE_TAKEN')
    }
    throw err
  }
}

// Mudar o seats de um pacote não mexe em contrato nenhum: a quantidade é
// copiada para ContractTerms.includedSeats quando o contrato é montado.
export async function updatePackage(
  id: string,
  input: PackageUpdateData,
  actorId: string
): Promise<LicensePackageDto> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.licensePackage.findUnique({ where: { id } })
    if (!before) throw notFound('Pacote não encontrado')
    const fields = changedFields(before, input, PACKAGE_KEYS, PACKAGE_PRICE_KEYS)
    if (fields.length === 0) return toPackageDto(before)
    const pkg = await tx.licensePackage.update({ where: { id }, data: input })
    await recordBillingEvent(tx, {
      type: 'PACKAGE_UPDATED',
      companyId: null,
      actorId,
      fields,
      ref: { packageCode: before.code },
    })
    return toPackageDto(pkg)
  })
}

export async function setPackageActive(
  id: string,
  active: boolean,
  actorId: string
): Promise<LicensePackageDto> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.licensePackage.findUnique({ where: { id } })
    if (!before) throw notFound('Pacote não encontrado')
    if (before.active === active) return toPackageDto(before)
    const pkg = await tx.licensePackage.update({ where: { id }, data: { active } })
    await recordBillingEvent(tx, {
      type: active ? 'PACKAGE_ACTIVATED' : 'PACKAGE_DEACTIVATED',
      companyId: null,
      actorId,
      fields: ['active'],
      ref: { packageCode: before.code },
    })
    return toPackageDto(pkg)
  })
}

// ─── Regras de cobrança ──────────────────────────────────────────────────────

// A linha `global` nasce na migration. Banco criado sem ela (ex.: db push de
// desenvolvimento) ganha a linha com os padrões do schema.
async function readSettingsRow(db: Prisma.TransactionClient): Promise<BillingSettings> {
  const row = await db.billingSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (row) return row
  return db.billingSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  })
}

export async function getSettings(): Promise<BillingSettingsDto> {
  return toSettingsDto(await readSettingsRow(prisma))
}

export async function updateSettings(
  input: SettingsData,
  actorId: string
): Promise<BillingSettingsDto> {
  return prisma.$transaction(async (tx) => {
    const before = await readSettingsRow(tx)
    const fields = changedFields(before, input, SETTINGS_KEYS)
    if (fields.length === 0) return toSettingsDto(before)
    // Campos explícitos: autoBlockEnabled nunca é escrito aqui (decisão padrão 4)
    const after = await tx.billingSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        overdueBlockDays: input.overdueBlockDays,
        dueReminderDays: input.dueReminderDays,
        notifyEmail: input.notifyEmail,
      },
    })
    await recordBillingEvent(tx, { type: 'SETTINGS_UPDATED', companyId: null, actorId, fields })
    return toSettingsDto(after)
  })
}
