// Flag da camada de Inteligência da empresa do usuário (E12).
// Vem do /auth/me (persistido no SecureStore) — vale também offline.
import { useAuthStore } from '../store/auth.store'

export function useIntelEnabled(): boolean {
  return useAuthStore((s) => s.user?.company?.intelligenceEnabled ?? false)
}
