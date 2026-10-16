import { ContractAccessOnly } from '@/components/ContractAccessOnly'

// Plano e cobrança (planos 015 e 016) — o mesmo gate de /contrato (014): o
// ADMIN da empresa vê o plano, as licenças, os pedidos e as faturas; o
// SUPERADMIN vê o aviso de que o plano de cada cliente fica na ficha; vendedor
// e gerente vão para /inteligencia.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ContractAccessOnly>{children}</ContractAccessOnly>
}
