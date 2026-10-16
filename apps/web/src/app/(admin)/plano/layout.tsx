import { ContractAccessOnly } from '@/components/ContractAccessOnly'

// Plano e cobrança (plano 015) — o mesmo gate de /contrato: o ADMIN da empresa
// vê o plano, as licenças e os pedidos; o SUPERADMIN vê o aviso de que o plano
// de cada cliente fica na ficha; vendedor e gerente vão para /inteligencia.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ContractAccessOnly>{children}</ContractAccessOnly>
}
