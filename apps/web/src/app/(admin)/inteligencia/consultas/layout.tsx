import { IntelAdminOnly } from '@/components/IntelAdminOnly'

// Configuração da Inteligência — só intel.admin; o gerente não vê (08/10/2026)
export default function Layout({ children }: { children: React.ReactNode }) {
  return <IntelAdminOnly>{children}</IntelAdminOnly>
}
