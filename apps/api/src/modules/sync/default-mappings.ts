// Mapeamentos padrão de campos Protheus → campos internos.
// Usados quando a empresa não configura syncConfig para a entidade.

export const DEFAULT_MAPPINGS = {
  products: {
    // Formato padrão: POST com paginação, resposta { paginas, produtos: [...] }
    // preco e estoque são strings JSON: {"atual":0,"moeda":"BRL"} / {"quantidade":0,"localizacao":"0101"}
    // O parse desses campos é feito diretamente em sync.service.ts (não pelo field-mapper)
    responseKey: 'produtos',
    fields: {
      protheusCode: 'id',
      name:         'nome',
      price:        'preco',    // string JSON → .atual
      unit:         '',         // não retornado pela API (usa 'UN' como padrão)
      stock:        'estoque',  // string JSON → .quantidade
      saldo:        'estoque',
    },
  },
  customers: {
    responseKey: 'clientes',
    fields: {
      protheusCode: 'A1_COD',
      loja:         'A1_LOJA',
      name:         'A1_NOME',
      document:     'A1_CGC',
      email:        'A1_EMAIL',
      phoneDdd:     'A1_DDD',
      phone:        'A1_TEL',
      address:      'A1_END',
      municipio:    'A1_MUN',
      bairro:       'A1_BAIRRO',
      cep:          'A1_CEP',
      uf:           'A1_EST',
    },
  },
  transportadoras: {
    responseKey: 'data',
    fields: {
      protheusCode: 'A4_COD',
      nome:         'A4_NOME',
    },
  },
  condPags: {
    responseKey: 'data',
    fields: {
      protheusCode: 'E4_COD',
      nome:         'E4_DESCRI',
    },
  },
} as const
