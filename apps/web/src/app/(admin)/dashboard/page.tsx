import { redirect } from 'next/navigation'

// A lista de empresas virou Clientes, na Gestão Addere (plano 013).
// Mantido para links e favoritos antigos.
export default function DashboardRedirect() {
  redirect('/gestao/clientes')
}
