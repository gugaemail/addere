// Perfil do usuário no app (decisão 1 do teste geral de 25/08/2026).
//
// "Gerente" = intel.manager sem carteira própria — vem do /auth/me
// (`intelManager`), com a lista de permissões como reserva para sessões
// gravadas antes do campo existir. Os dois ficam no SecureStore: vale offline.
import { useAuthStore } from '../store/auth.store'

export function useIsManager(): boolean {
  return useAuthStore(
    (s) =>
      s.user?.role !== 'SUPERADMIN' &&
      (Boolean(s.user?.intelManager) || s.permissions.includes('intel.manager'))
  )
}

/** Tem carteira no Protheus — só quem tem pode chamar /intel/app/* (senão 422). */
export function useHasVendorCode(): boolean {
  return useAuthStore((s) => Boolean(s.user?.idVendProt))
}
