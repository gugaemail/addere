// Mapeamentos padrão de campos Protheus → campos internos.
// Usados quando a empresa não configura syncConfig para a entidade.

export const DEFAULT_MAPPINGS = {
  products: {
    responseKey: 'data',
    fields: {
      protheusCode: 'B1_COD',
      name:         'B1_DESC',
      price:        'B1_PRE1',
      unit:         'B1_UM',
      stock:        'B1_ESTQ',
      saldo:        'B1_SALDO',
    },
  },
  customers: {
    responseKey: 'data',
    fields: {
      protheusCode: 'A1_COD',
      loja:         'A1_LOJA',
      name:         'A1_NOME',
      document:     'A1_CGC',
      email:        'A1_EMAIL',
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
