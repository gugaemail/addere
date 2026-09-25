import { SuperAdminOnly } from '@/components/SuperAdminOnly'

// Telas exclusivas do SUPERADMIN (E9) — gate antes de montar a página
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SuperAdminOnly>{children}</SuperAdminOnly>
}
