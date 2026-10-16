import { ContractAccessOnly } from '@/components/ContractAccessOnly'

// Plano e cobrança (planos 015 e 016) — o mesmo gate do /contrato (014): o
// ADMIN da empresa lê; vendedor e gerente vão para /inteligencia.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ContractAccessOnly>{children}</ContractAccessOnly>
}
