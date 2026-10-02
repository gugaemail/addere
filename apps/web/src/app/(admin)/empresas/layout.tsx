import { CompanyScopeOnly } from '@/components/CompanyScopeOnly'

// SUPERADMIN abre qualquer empresa; ADMIN, só a dele (E23) — gate antes de
// montar a página. A lista de empresas (/dashboard) segue só do SUPERADMIN.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CompanyScopeOnly>{children}</CompanyScopeOnly>
}
