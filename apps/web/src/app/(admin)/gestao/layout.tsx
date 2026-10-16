import { SuperAdminOnly } from '@/components/SuperAdminOnly'

// Gestão Addere — só o SUPERADMIN. Quem não é vai para /inteligencia antes de a
// página montar (a API responderia 403 a /admin/billing/* de qualquer forma).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SuperAdminOnly>{children}</SuperAdminOnly>
}
