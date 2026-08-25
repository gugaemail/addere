// Catálogo de permissões do sistema — fonte única para seed, data migrations e API.
// Ao adicionar uma chave nova: incluir aqui, no seed (roda em dev) e em uma data
// migration (produção não roda seed — render.yaml só faz migrate deploy).

export interface PermissionDefinition {
  key: string
  label: string
  category: string
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'users.view', label: 'Ver usuários da empresa', category: 'users' },
  { key: 'users.manage', label: 'Criar/ativar/desativar usuários', category: 'users' },
  { key: 'sync.protheus', label: 'Executar sincronização com Protheus', category: 'sync' },
  {
    key: 'orders.reset_pending',
    label: 'Reverter pedido sincronizado para pendente',
    category: 'orders',
  },
  { key: 'orders.change_carrier', label: 'Alterar transportadora do pedido', category: 'orders' },
  {
    key: 'orders.change_payment_terms',
    label: 'Alterar condição de pagamento do pedido',
    category: 'orders',
  },
  // ─── Camada de Inteligência (decisão D3) ───
  {
    key: 'intel.admin',
    label: 'Inteligência: configurar consultas, premissas e saúde dos dados',
    category: 'intelligence',
  },
  {
    key: 'intel.manager',
    label: 'Inteligência: acompanhar equipe em campo e perdas',
    category: 'intelligence',
  },
]

// Permissões concedidas por padrão a cada role — aplicadas no seed (backfill)
// e em createUser (usuários novos). intel.manager nunca é default: é atribuída
// manualmente ao gerente comercial via painel (decisão D3c).
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  ADMIN: [
    'users.view',
    'users.manage',
    'sync.protheus',
    'orders.reset_pending',
    'orders.change_carrier',
    'orders.change_payment_terms',
    'intel.admin',
  ],
  SALESPERSON: ['orders.change_carrier', 'orders.change_payment_terms'],
}
