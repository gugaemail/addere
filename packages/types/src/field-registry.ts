export interface FieldDefinition {
  key: string
  entity: 'customer' | 'order' | 'orderItem' | 'product'
  label: string
  screens: string[]
  affectsInput: boolean
}

export const FIELD_REGISTRY: FieldDefinition[] = [
  // Customer
  { key: 'customer.document',    entity: 'customer',  label: 'CPF/CNPJ',           screens: ['clienteList', 'clienteDetail', 'novoPedido'], affectsInput: false },
  { key: 'customer.email',       entity: 'customer',  label: 'E-mail',              screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.phone',       entity: 'customer',  label: 'Telefone',            screens: ['clienteList', 'clienteDetail'],                affectsInput: false },
  { key: 'customer.address',     entity: 'customer',  label: 'Endereço',            screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.municipio',   entity: 'customer',  label: 'Cidade',              screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.uf',          entity: 'customer',  label: 'Estado',              screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.ultcom',      entity: 'customer',  label: 'Última Compra',       screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.transpPadrao',entity: 'customer',  label: 'Transportadora Padrão',screens: ['clienteDetail'],                             affectsInput: false },
  { key: 'customer.condPagPadrao',entity: 'customer', label: 'Cond. Pagamento Padrão',screens: ['clienteDetail'],                            affectsInput: false },
  { key: 'customer.tes',         entity: 'customer',  label: 'Código TES',           screens: ['clienteDetail'],                              affectsInput: false },
  { key: 'customer.xcodemp',     entity: 'customer',  label: 'Filial de Faturamento',screens: ['clienteDetail'],                              affectsInput: false },

  // Order
  { key: 'order.emissao',        entity: 'order',     label: 'Data de Emissão',     screens: ['novoPedido', 'pedidoDetail'],                  affectsInput: true  },
  { key: 'order.mennota',        entity: 'order',     label: 'Mensagem NF',         screens: ['novoPedido', 'pedidoDetail'],                  affectsInput: true  },
  { key: 'order.notes',          entity: 'order',     label: 'Observação Interna',  screens: ['novoPedido', 'pedidoDetail'],                  affectsInput: true  },
  { key: 'order.transportadora', entity: 'order',     label: 'Transportadora',      screens: ['novoPedido', 'pedidoDetail'],                  affectsInput: true  },
  { key: 'order.condPag',        entity: 'order',     label: 'Cond. Pagamento',     screens: ['novoPedido', 'pedidoDetail'],                  affectsInput: true  },
  { key: 'order.protheusStatus', entity: 'order',     label: 'Status Protheus',     screens: ['pedidoDetail'],                               affectsInput: false },

  // OrderItem
  { key: 'orderItem.discount',      entity: 'orderItem', label: 'Desconto',            screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.descricao',     entity: 'orderItem', label: 'Descrição do Item',   screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.unitPrice',     entity: 'orderItem', label: 'Preço Editável',      screens: ['novoPedido'],                 affectsInput: true  },
  { key: 'orderItem.largura',       entity: 'orderItem', label: 'Largura',             screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.espessura',     entity: 'orderItem', label: 'Espessura',           screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.encolhimento',  entity: 'orderItem', label: 'Encolhimento',        screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.xcrav',         entity: 'orderItem', label: 'Largura Crav.',       screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },
  { key: 'orderItem.tara',          entity: 'orderItem', label: 'Tara',                screens: ['novoPedido', 'pedidoDetail'],  affectsInput: true  },

  // Product
  { key: 'product.stock',        entity: 'product',   label: 'Estoque',             screens: ['produtoList'],                                affectsInput: false },
  { key: 'product.description',  entity: 'product',   label: 'Descrição',           screens: ['produtoList'],                                affectsInput: false },
  { key: 'product.protheusCode', entity: 'product',   label: 'Código Protheus',     screens: ['produtoList'],                                affectsInput: false },
]

export const FIELD_REGISTRY_KEYS = new Set(FIELD_REGISTRY.map((f) => f.key))
