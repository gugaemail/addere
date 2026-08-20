// Catálogo declarativo dos contratos de consulta (doc de arquitetura §3.3).
// Cada empresa preenche o SELECT que responde ao contrato no Protheus dela;
// as colunas são os aliases obrigatórios em português (o agente nunca vê SQL).

import type { IntelQueryName, IntelQueryScope } from '@addere/types'
import type { PlaceholderName } from './placeholders'

export type ContractFrequency = 'DAILY' | 'REFRESH' | 'WEEKLY' | 'ON_DEMAND'

export interface ContractColumn {
  name: string // alias em português (cliente_cod, valor…)
  required: boolean
  kind: 'string' | 'number' | 'date'
}

export interface ReferenceSql {
  label: string
  sql: string
}

export interface QueryContract {
  name: IntelQueryName
  labelPt: string
  frequency: ContractFrequency
  /** Janela da carga incremental em dias (SALES); null = completa */
  incrementalWindowDays: number | null
  allowedScopes: IntelQueryScope[]
  requiredPlaceholders: PlaceholderName[]
  optionalPlaceholders: PlaceholderName[]
  columns: ContractColumn[]
  referenceSql: ReferenceSql[]
  helpText: string
}

const col = (name: string, required: boolean, kind: ContractColumn['kind']): ContractColumn => ({
  name,
  required,
  kind,
})

export const QUERY_CONTRACTS: Record<IntelQueryName, QueryContract> = {
  CUSTOMERS: {
    name: 'CUSTOMERS',
    labelPt: 'clientes',
    frequency: 'DAILY',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['FILIAL'],
    optionalPlaceholders: ['HOJE'],
    columns: [
      col('cliente_cod', true, 'string'),
      col('cliente_loja', true, 'string'),
      col('cliente_nome', true, 'string'),
      col('vendedor_cod', true, 'string'),
      col('cidade', true, 'string'),
      col('uf', true, 'string'),
      col('bairro', false, 'string'),
      col('endereco', false, 'string'),
      col('cep', false, 'string'),
      col('cnpj', false, 'string'),
      col('bloqueado', false, 'string'),
      col('limite_credito', false, 'number'),
      col('segmento', false, 'string'),
      col('ultima_compra', false, 'date'),
    ],
    referenceSql: [
      {
        label: 'SA1 (cadastro de clientes)',
        sql: `SELECT A1_COD AS cliente_cod, A1_LOJA AS cliente_loja, A1_NOME AS cliente_nome,
       A1_VEND AS vendedor_cod, A1_MUN AS cidade, A1_EST AS uf, A1_BAIRRO AS bairro,
       A1_END AS endereco, A1_CEP AS cep, A1_CGC AS cnpj, A1_MSBLQL AS bloqueado,
       A1_LC AS limite_credito, A1_ULTCOM AS ultima_compra
FROM SA1010
WHERE D_E_L_ET_ = ' ' AND A1_FILIAL IN ({{FILIAL}})`,
      },
    ],
    helpText:
      'Enriquece o cadastro sincronizado via apiCliente com limite de crédito, segmento e última compra. A fronteira de segurança é o endpoint do Protheus (só aceita SELECT) — confirme com o consultor o usuário de banco somente-leitura.',
  },

  SALES: {
    name: 'SALES',
    labelPt: 'vendas',
    frequency: 'REFRESH',
    incrementalWindowDays: 7,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['FILIAL', 'DATA_INI', 'DATA_FIM'],
    optionalPlaceholders: ['HOJE'],
    columns: [
      col('pedido', true, 'string'),
      col('data', true, 'date'),
      col('cliente_cod', true, 'string'),
      col('cliente_loja', true, 'string'),
      col('vendedor_cod', true, 'string'),
      col('produto_cod', true, 'string'),
      col('quantidade', true, 'number'),
      col('valor', true, 'number'),
      col('item', false, 'string'),
      col('produto_desc', false, 'string'),
      col('grupo_produto', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SD2/SF2 (faturamento)',
        sql: `SELECT D2_DOC+D2_SERIE AS pedido, D2_ITEM AS item, D2_EMISSAO AS data,
       D2_CLIENTE AS cliente_cod, D2_LOJA AS cliente_loja, F2_VEND1 AS vendedor_cod,
       D2_COD AS produto_cod, B1_DESC AS produto_desc, D2_QUANT AS quantidade,
       D2_VALBRUT AS valor, B1_GRUPO AS grupo_produto
FROM SD2010 D2
JOIN SF2010 F2 ON F2_FILIAL=D2_FILIAL AND F2_DOC=D2_DOC AND F2_SERIE=D2_SERIE AND F2.D_E_L_ET_=' '
JOIN SB1010 B1 ON B1_COD=D2_COD AND B1.D_E_L_ET_=' '
JOIN SF4010 F4 ON F4_CODIGO=D2_TES AND F4_DUPLIC='S'
WHERE D2.D_E_L_ET_=' ' AND D2_FILIAL IN ({{FILIAL}})
  AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}`,
      },
      {
        label: 'SC5/SC6 (pedidos)',
        sql: `SELECT C5_NUM AS pedido, C6_ITEM AS item, C5_EMISSAO AS data,
       C5_CLIENTE AS cliente_cod, C5_LOJACLI AS cliente_loja, C5_VEND1 AS vendedor_cod,
       C6_PRODUTO AS produto_cod, C6_QTDVEN AS quantidade, C6_VALOR AS valor
FROM SC6010 C6
JOIN SC5010 C5 ON C5_FILIAL=C6_FILIAL AND C5_NUM=C6_NUM AND C5.D_E_L_ET_=' '
WHERE C6.D_E_L_ET_=' ' AND C6_BLQ<>'R' AND C6_FILIAL IN ({{FILIAL}})
  AND C5_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}`,
      },
    ],
    helpText:
      'Confirme que a consulta EXCLUI devoluções, bonificações e remessas (verifique F4_DUPLIC e os TES usados). A coluna opcional "item" (D2_ITEM/C6_ITEM) evita colapsar o mesmo produto repetido no pedido. Reconciliação contra o faturamento oficial é obrigatória antes de publicar.',
  },

  OPEN_TITLES: {
    name: 'OPEN_TITLES',
    labelPt: 'títulos em aberto',
    frequency: 'REFRESH',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['FILIAL'],
    optionalPlaceholders: ['HOJE'],
    columns: [
      col('titulo', true, 'string'),
      col('cliente_cod', true, 'string'),
      col('cliente_loja', true, 'string'),
      col('vencimento', true, 'date'),
      col('valor_saldo', true, 'number'),
      col('dias_atraso', false, 'number'),
    ],
    referenceSql: [
      {
        label: 'SE1 (contas a receber)',
        sql: `SELECT E1_NUM AS titulo, E1_CLIENTE AS cliente_cod, E1_LOJA AS cliente_loja,
       E1_VENCREA AS vencimento, E1_SALDO AS valor_saldo
FROM SE1010
WHERE D_E_L_ET_=' ' AND E1_FILIAL IN ({{FILIAL}}) AND E1_SALDO > 0
  AND E1_TIPO NOT IN ('NCC','RA','AB-','PA')`,
      },
    ],
    helpText:
      'Só títulos com saldo > 0. Excluir tipos que não são cobrança (NCC, RA, AB-, PA). Gera o status Bloqueado quando vencido além do parâmetro da empresa.',
  },

  PRODUCTS: {
    name: 'PRODUCTS',
    labelPt: 'produtos',
    frequency: 'WEEKLY',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: [],
    optionalPlaceholders: ['FILIAL', 'HOJE'],
    columns: [
      col('produto_cod', true, 'string'),
      col('produto_desc', true, 'string'),
      col('grupo', true, 'string'),
      col('ativo', true, 'string'),
      col('preco_tabela', false, 'number'),
    ],
    referenceSql: [
      {
        label: 'SB1 (produtos)',
        sql: `SELECT B1_COD AS produto_cod, B1_DESC AS produto_desc, B1_GRUPO AS grupo,
       CASE WHEN B1_MSBLQL = '1' THEN 'N' ELSE 'S' END AS ativo
FROM SB1010
WHERE D_E_L_ET_=' '`,
      },
    ],
    helpText:
      'Enriquece o catálogo sincronizado via apiPord com o grupo (base do cross-sell na fase 2).',
  },

  STOCK: {
    name: 'STOCK',
    labelPt: 'estoque (ao vivo)',
    frequency: 'ON_DEMAND',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['PRODUTO'],
    optionalPlaceholders: ['FILIAL'],
    columns: [
      col('produto_cod', true, 'string'),
      col('saldo', true, 'number'),
      col('local', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SB2 (saldo em estoque)',
        sql: `SELECT B2_COD AS produto_cod, B2_QATU - B2_RESERVA AS saldo, B2_LOCAL AS local
FROM SB2010
WHERE D_E_L_ET_=' ' AND B2_COD = {{PRODUTO}} AND B2_FILIAL IN ({{FILIAL}})`,
      },
    ],
    helpText:
      'Consulta ao vivo, fora do sync — aparece no app como "confirme disponibilidade" (fase 2; na fase 1 o app usa o saldo do sync de produtos).',
  },
}

export function getContract(name: IntelQueryName): QueryContract {
  return QUERY_CONTRACTS[name]
}
