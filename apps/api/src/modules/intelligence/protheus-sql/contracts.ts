// Catálogo declarativo dos contratos de consulta (doc de arquitetura §3.3).
// Cada empresa preenche o SELECT que responde ao contrato no Protheus dela;
// as colunas são os aliases obrigatórios em português (o agente nunca vê SQL).

import type { IntelQueryName, IntelQueryScope, ReconciliationSpec } from '@addere/types'
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
  /**
   * A primeira é a recomendada e a que abre no editor vazio (incremental, se
   * houver). Toda referência termina em ORDER BY R_E_C_N_O_: o endpoint pagina, e
   * sem ordem estável a mesma linha vem em duas páginas e outra fica de fora.
   * Tabela que só filtra (SF4) entra por EXISTS e cadastro (SB1) por OUTER APPLY
   * TOP 1: registro excluído e reincluído N vezes, ou exclusivo por filial,
   * num JOIN multiplicaria o item N vezes.
   */
  referenceSql: ReferenceSql[]
  helpText: string
  /** Como a consulta é comparada com o número oficial antes de publicar */
  reconciliation: ReconciliationSpec
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
    optionalPlaceholders: ['HOJE', 'DESDE', 'INCREMENTAL'],
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
      col('excluido', false, 'string'),
      col('stamp', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SA1 incremental',
        sql: `SELECT A1_COD AS cliente_cod, A1_LOJA AS cliente_loja, A1_NOME AS cliente_nome,
       A1_VEND AS vendedor_cod, A1_MUN AS cidade, A1_EST AS uf, A1_BAIRRO AS bairro,
       A1_END AS endereco, A1_CEP AS cep, A1_CGC AS cnpj, A1_MSBLQL AS bloqueado,
       A1_LC AS limite_credito, A1_ULTCOM AS ultima_compra,
       D_E_L_E_T_ AS excluido, CONVERT(VARCHAR(23), S_T_A_M_P_, 121) AS stamp
FROM SA1010
WHERE A1_FILIAL IN ({{FILIAL}})
  AND (  ({{INCREMENTAL}} = 1 AND S_T_A_M_P_ > {{DESDE}})
      OR ({{INCREMENTAL}} = 0 AND D_E_L_E_T_ = ' '))
ORDER BY R_E_C_N_O_`,
      },
      {
        label: 'SA1 (cadastro de clientes)',
        sql: `SELECT A1_COD AS cliente_cod, A1_LOJA AS cliente_loja, A1_NOME AS cliente_nome,
       A1_VEND AS vendedor_cod, A1_MUN AS cidade, A1_EST AS uf, A1_BAIRRO AS bairro,
       A1_END AS endereco, A1_CEP AS cep, A1_CGC AS cnpj, A1_MSBLQL AS bloqueado,
       A1_LC AS limite_credito, A1_ULTCOM AS ultima_compra
FROM SA1010
WHERE D_E_L_E_T_ = ' ' AND A1_FILIAL IN ({{FILIAL}})
ORDER BY R_E_C_N_O_`,
      },
    ],
    helpText:
      'Enriquece o cadastro sincronizado via apiCliente com limite de crédito, segmento e última compra. A fronteira de segurança é o endpoint do Protheus (só aceita SELECT) — confirme com o consultor o usuário de banco somente-leitura. Para sincronizar só o que mudou, use a referência incremental: {{INCREMENTAL}} = 1 traz o que mudou desde {{DESDE}} (inclusive exclusões, na coluna excluido); 0 traz a foto completa, usada na prévia, na reconciliação e na carga semanal.',
    reconciliation: {
      kind: 'COUNT_SNAPSHOT',
      column: null,
      unit: 'count',
      label: 'Quantidade de clientes no cadastro',
      hint: 'Quantos clientes o cadastro do Protheus (SA1) tem hoje, com os mesmos filtros da consulta: filiais, bloqueados e lojas.',
      dateColumn: null,
      dateGranularity: null,
      keyColumns: ['cliente_cod', 'cliente_loja'],
    },
  },

  SALES: {
    name: 'SALES',
    labelPt: 'vendas',
    frequency: 'REFRESH',
    incrementalWindowDays: 7,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['FILIAL', 'DATA_INI', 'DATA_FIM'],
    optionalPlaceholders: ['HOJE', 'DESDE', 'INCREMENTAL'],
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
      col('excluido', false, 'string'),
      col('stamp', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SD2/SF2 incremental',
        sql: `SELECT D2_DOC+D2_SERIE AS pedido, D2_ITEM AS item, D2_EMISSAO AS data,
       D2_CLIENTE AS cliente_cod, D2_LOJA AS cliente_loja, F2_VEND1 AS vendedor_cod,
       D2_COD AS produto_cod, B1_DESC AS produto_desc, D2_QUANT AS quantidade,
       D2_VALBRUT AS valor, B1_GRUPO AS grupo_produto,
       CASE WHEN D2.D_E_L_E_T_='*' OR F2.D_E_L_E_T_='*' THEN '*' ELSE ' ' END AS excluido,
       CONVERT(VARCHAR(23), CASE
         WHEN COALESCE(F2.S_T_A_M_P_, '19000101') > COALESCE(D2.S_T_A_M_P_, '19000101')
         THEN F2.S_T_A_M_P_ ELSE D2.S_T_A_M_P_ END, 121) AS stamp
FROM SD2010 D2
JOIN SF2010 F2 ON F2_FILIAL=D2_FILIAL AND F2_DOC=D2_DOC AND F2_SERIE=D2_SERIE
OUTER APPLY (SELECT TOP 1 B1_DESC, B1_GRUPO FROM SB1010 B1
             WHERE B1_COD=D2_COD AND B1.D_E_L_E_T_=' ' ORDER BY B1.R_E_C_N_O_ DESC) B1
WHERE D2_FILIAL IN ({{FILIAL}})
  AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}
  AND EXISTS (SELECT 1 FROM SF4010 F4
              WHERE F4_CODIGO=D2_TES AND F4_DUPLIC='S' AND F4.D_E_L_E_T_=' ')
  AND (  ({{INCREMENTAL}} = 1 AND (D2.S_T_A_M_P_ > {{DESDE}} OR F2.S_T_A_M_P_ > {{DESDE}}))
      OR ({{INCREMENTAL}} = 0 AND D2.D_E_L_E_T_=' ' AND F2.D_E_L_E_T_=' '))
ORDER BY D2.R_E_C_N_O_`,
      },
      {
        label: 'SD2/SF2 (faturamento)',
        sql: `SELECT D2_DOC+D2_SERIE AS pedido, D2_ITEM AS item, D2_EMISSAO AS data,
       D2_CLIENTE AS cliente_cod, D2_LOJA AS cliente_loja, F2_VEND1 AS vendedor_cod,
       D2_COD AS produto_cod, B1_DESC AS produto_desc, D2_QUANT AS quantidade,
       D2_VALBRUT AS valor, B1_GRUPO AS grupo_produto
FROM SD2010 D2
JOIN SF2010 F2 ON F2_FILIAL=D2_FILIAL AND F2_DOC=D2_DOC AND F2_SERIE=D2_SERIE AND F2.D_E_L_E_T_=' '
OUTER APPLY (SELECT TOP 1 B1_DESC, B1_GRUPO FROM SB1010 B1
             WHERE B1_COD=D2_COD AND B1.D_E_L_E_T_=' ' ORDER BY B1.R_E_C_N_O_ DESC) B1
WHERE D2.D_E_L_E_T_=' ' AND D2_FILIAL IN ({{FILIAL}})
  AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}
  AND EXISTS (SELECT 1 FROM SF4010 F4
              WHERE F4_CODIGO=D2_TES AND F4_DUPLIC='S' AND F4.D_E_L_E_T_=' ')
ORDER BY D2.R_E_C_N_O_`,
      },
      {
        label: 'SC5/SC6 (pedidos)',
        sql: `SELECT C5_NUM AS pedido, C6_ITEM AS item, C5_EMISSAO AS data,
       C5_CLIENTE AS cliente_cod, C5_LOJACLI AS cliente_loja, C5_VEND1 AS vendedor_cod,
       C6_PRODUTO AS produto_cod, C6_QTDVEN AS quantidade, C6_VALOR AS valor
FROM SC6010 C6
JOIN SC5010 C5 ON C5_FILIAL=C6_FILIAL AND C5_NUM=C6_NUM AND C5.D_E_L_E_T_=' '
WHERE C6.D_E_L_E_T_=' ' AND C6_BLQ<>'R' AND C6_FILIAL IN ({{FILIAL}})
  AND C5_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}
ORDER BY C6.R_E_C_N_O_`,
      },
    ],
    helpText:
      'Confirme que a consulta EXCLUI devoluções, bonificações e remessas (verifique F4_DUPLIC e os TES usados). A coluna opcional "item" (D2_ITEM/C6_ITEM) evita colapsar o mesmo produto repetido no pedido. Reconciliação contra o faturamento oficial é obrigatória antes de publicar. Para sincronizar só o que mudou, use a referência incremental: {{INCREMENTAL}} = 1 traz o que mudou desde {{DESDE}} (inclusive exclusões, na coluna excluido); 0 traz a foto completa, usada na prévia, na reconciliação e na carga semanal.',
    reconciliation: {
      kind: 'SUM_MONTH',
      column: 'valor',
      unit: 'currency',
      label: 'Valor oficial do mês (R$)',
      hint: 'Compare um mês fechado com o total que o financeiro considera correto (faturamento ou vendido, conforme a referência usada).',
      dateColumn: 'data',
      dateGranularity: 'day',
      keyColumns: ['pedido', 'item', 'produto_cod'],
    },
  },

  OPEN_TITLES: {
    name: 'OPEN_TITLES',
    labelPt: 'títulos em aberto',
    frequency: 'REFRESH',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: ['FILIAL'],
    optionalPlaceholders: ['HOJE', 'DESDE', 'INCREMENTAL'],
    columns: [
      col('titulo', true, 'string'),
      col('cliente_cod', true, 'string'),
      col('cliente_loja', true, 'string'),
      col('vencimento', true, 'date'),
      col('valor_saldo', true, 'number'),
      col('dias_atraso', false, 'number'),
      col('excluido', false, 'string'),
      col('stamp', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SE1 incremental',
        sql: `SELECT E1_FILIAL+E1_PREFIXO+E1_NUM+E1_PARCELA+E1_TIPO AS titulo,
       E1_CLIENTE AS cliente_cod, E1_LOJA AS cliente_loja, E1_VENCREA AS vencimento,
       E1_SALDO AS valor_saldo,
       D_E_L_E_T_ AS excluido, CONVERT(VARCHAR(23), S_T_A_M_P_, 121) AS stamp
FROM SE1010
WHERE E1_FILIAL IN ({{FILIAL}}) AND E1_TIPO NOT IN ('NCC','RA','AB-','PA')
  AND (  ({{INCREMENTAL}} = 1 AND S_T_A_M_P_ > {{DESDE}})
      OR ({{INCREMENTAL}} = 0 AND E1_SALDO > 0 AND D_E_L_E_T_ = ' '))
ORDER BY R_E_C_N_O_`,
      },
      {
        label: 'SE1 (contas a receber)',
        sql: `SELECT E1_FILIAL+E1_PREFIXO+E1_NUM+E1_PARCELA+E1_TIPO AS titulo,
       E1_CLIENTE AS cliente_cod, E1_LOJA AS cliente_loja,
       E1_VENCREA AS vencimento, E1_SALDO AS valor_saldo
FROM SE1010
WHERE D_E_L_E_T_=' ' AND E1_FILIAL IN ({{FILIAL}}) AND E1_SALDO > 0
  AND E1_TIPO NOT IN ('NCC','RA','AB-','PA')
ORDER BY R_E_C_N_O_`,
      },
    ],
    helpText:
      'Só títulos com saldo > 0. Excluir tipos que não são cobrança (NCC, RA, AB-, PA). Gera o status Bloqueado quando vencido além do parâmetro da empresa. Para sincronizar só o que mudou, use a referência incremental: {{INCREMENTAL}} = 1 traz o que mudou desde {{DESDE}} (inclusive exclusões, na coluna excluido); 0 traz a foto completa, usada na prévia, na reconciliação e na carga semanal.',
    reconciliation: {
      kind: 'SUM_SNAPSHOT',
      column: 'valor_saldo',
      unit: 'currency',
      label: 'Total a receber em aberto hoje (R$)',
      hint: 'Compare com o total do relatório de títulos a receber em aberto do financeiro, na posição de hoje — não é de um mês: é o saldo que existe agora.',
      dateColumn: 'vencimento',
      dateGranularity: 'month',
      keyColumns: ['titulo', 'cliente_cod', 'cliente_loja', 'vencimento'],
    },
  },

  PRODUCTS: {
    name: 'PRODUCTS',
    labelPt: 'produtos',
    frequency: 'WEEKLY',
    incrementalWindowDays: null,
    allowedScopes: ['ALL'],
    requiredPlaceholders: [],
    optionalPlaceholders: ['FILIAL', 'HOJE', 'DESDE', 'INCREMENTAL'],
    columns: [
      col('produto_cod', true, 'string'),
      col('produto_desc', true, 'string'),
      col('grupo', true, 'string'),
      col('ativo', true, 'string'),
      col('preco_tabela', false, 'number'),
      col('excluido', false, 'string'),
      col('stamp', false, 'string'),
    ],
    referenceSql: [
      {
        label: 'SB1 incremental',
        sql: `SELECT B1_COD AS produto_cod, B1_DESC AS produto_desc, B1_GRUPO AS grupo,
       CASE WHEN B1_MSBLQL = '1' THEN 'N' ELSE 'S' END AS ativo,
       D_E_L_E_T_ AS excluido, CONVERT(VARCHAR(23), S_T_A_M_P_, 121) AS stamp
FROM SB1010
WHERE (  ({{INCREMENTAL}} = 1 AND S_T_A_M_P_ > {{DESDE}})
      OR ({{INCREMENTAL}} = 0 AND D_E_L_E_T_ = ' '))
ORDER BY R_E_C_N_O_`,
      },
      {
        label: 'SB1 (produtos)',
        sql: `SELECT B1_COD AS produto_cod, B1_DESC AS produto_desc, B1_GRUPO AS grupo,
       CASE WHEN B1_MSBLQL = '1' THEN 'N' ELSE 'S' END AS ativo
FROM SB1010
WHERE D_E_L_E_T_=' '
ORDER BY R_E_C_N_O_`,
      },
    ],
    helpText:
      'Enriquece o catálogo sincronizado via apiPord com o grupo (base do cross-sell na fase 2). Para sincronizar só o que mudou, use a referência incremental: {{INCREMENTAL}} = 1 traz o que mudou desde {{DESDE}} (inclusive exclusões, na coluna excluido); 0 traz a foto completa, usada na prévia, na reconciliação e na carga semanal.',
    reconciliation: {
      kind: 'COUNT_SNAPSHOT',
      column: null,
      unit: 'count',
      label: 'Quantidade de produtos no cadastro',
      hint: 'Quantos produtos o cadastro do Protheus (SB1) tem hoje, com os mesmos filtros da consulta (ativos, tipos).',
      dateColumn: null,
      dateGranularity: null,
      keyColumns: ['produto_cod'],
    },
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
WHERE D_E_L_E_T_=' ' AND B2_COD = {{PRODUTO}} AND B2_FILIAL IN ({{FILIAL}})`,
      },
    ],
    helpText:
      'Consulta ao vivo, fora do sync — aparece no app como "confirme disponibilidade" (fase 2; na fase 1 o app usa o saldo do sync de produtos).',
    reconciliation: {
      kind: 'NONE',
      column: null,
      unit: null,
      label: '',
      hint: 'O estoque é consultado produto a produto na hora da visita — não existe um total para comparar. Basta a prévia verde para publicar.',
      dateColumn: null,
      dateGranularity: null,
      keyColumns: ['produto_cod', 'local'],
    },
  },
}

export function getContract(name: IntelQueryName): QueryContract {
  return QUERY_CONTRACTS[name]
}
