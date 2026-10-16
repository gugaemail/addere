import { ContractAccessOnly } from '@/components/ContractAccessOnly'

// Contrato da empresa (plano 014) — ADMIN e SUPERADMIN. A impressão fica
// dentro do layout do painel (decisão de desenho 4): sidebar e barra do
// celular somem no papel pelo print:hidden.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ContractAccessOnly>{children}</ContractAccessOnly>
}
