// Recorte e avisos da tela Vendedores (E22) — puro, testado em __tests__/vendors.test.ts.
// "Vendedor" aqui é quem tem código Protheus: é o código que o põe no plano
// do dia e na Equipe em campo, não o perfil.
import type { UserPublic, Vehicle } from '@addere/types'

export const VEHICLE_LABELS: Record<Vehicle, string> = {
  CAR: 'Carro',
  MOTORCYCLE: 'Moto',
  FOOT: 'A pé',
}

export function vehicleLabel(vehicle: Vehicle | null | undefined): string {
  return vehicle ? VEHICLE_LABELS[vehicle] : '—'
}

/**
 * Usuários da empresa com código de vendedor, em ordem alfabética. Sem
 * empresa (SUPERADMIN sem seleção) devolve vazio: a tela pede a empresa ativa.
 */
export function vendorsOfCompany(users: UserPublic[], companyId: string | null): UserPublic[] {
  if (!companyId) return []
  return users
    .filter(
      (u) => u.role !== 'SUPERADMIN' && u.companyId === companyId && !!u.idVendProt?.trim()
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))
}

export interface VendorSetupWarnings {
  withoutManager: number
  withoutVisits: number
}

/**
 * Conta só os ativos — vendedor desativado não entra na equipe nem no plano.
 * Gerente que também vende com o próprio código não conta como "sem gerente":
 * ele é o gerente.
 */
export function vendorSetupWarnings(vendors: UserPublic[]): VendorSetupWarnings {
  const active = vendors.filter((v) => v.active)
  return {
    withoutManager: active.filter((v) => !v.managerId && !v.intelManager).length,
    withoutVisits: active.filter((v) => !v.visitsPerDay).length,
  }
}

export type ManagerCell =
  | { kind: 'name'; text: string }
  | { kind: 'is-manager'; text: string }
  | { kind: 'missing'; text: string }

/** Coluna Gerente: nome do gerente; "é gerente" para quem gerencia; senão o aviso. */
export function managerCell(users: UserPublic[], vendor: UserPublic): ManagerCell {
  if (vendor.managerId) return { kind: 'name', text: managerNameOf(users, vendor.managerId) }
  if (vendor.intelManager) return { kind: 'is-manager', text: 'é gerente' }
  return { kind: 'missing', text: 'sem gerente' }
}

function vendorCount(n: number): string {
  return `${n} vendedor${n === 1 ? '' : 'es'}`
}

/** Frase do aviso no topo; null quando não há o que avisar. */
export function vendorWarningText(warnings: VendorSetupWarnings): string | null {
  const parts: string[] = []
  if (warnings.withoutManager > 0) parts.push(`${vendorCount(warnings.withoutManager)} sem gerente`)
  if (warnings.withoutVisits > 0)
    parts.push(`${vendorCount(warnings.withoutVisits)} sem visitas por dia`)
  if (parts.length === 0) return null
  return `${parts.join(' e ')} — sem gerente o vendedor fica fora da equipe certa; sem visitas por dia vale o padrão da empresa.`
}

export function managerNameOf(users: UserPublic[], managerId: string | null | undefined): string {
  if (!managerId) return '—'
  return users.find((u) => u.id === managerId)?.name ?? '—'
}
