// Guarda de SQL das consultas configuráveis (E2, decisão D6: CTE permitido).
// Puro (sem I/O). Camada de HIGIENE — a fronteira real de segurança é o
// próprio endpoint Protheus, que só aceita SELECT na chegada (P7), e o
// usuário de banco read-only quando disponível.

import type { IntelQueryScope } from '@addere/types'
import { findPlaceholders, KNOWN_PLACEHOLDERS } from './placeholders'
import type { QueryContract } from './contracts'

export interface SqlViolation {
  code: string
  message: string
}

// Palavras inteiras proibidas (após remoção de literais de string).
// Obs.: a coluna Protheus D_E_L_E_T_ não casa com \bDELETE\b (tem underscores).
const FORBIDDEN_KEYWORDS = [
  // DML/DDL
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  // execução dinâmica / procedimentos
  'EXEC',
  'EXECUTE',
  'SP_EXECUTESQL',
  // acesso externo / abuso
  'OPENROWSET',
  'OPENQUERY',
  'OPENDATASOURCE',
  'WAITFOR',
  'BULK',
  // SELECT ... INTO cria tabela
  'INTO',
]

// Prefixos de objetos de sistema (SQL Server)
const FORBIDDEN_PREFIXES = [/\bXP_[A-Z0-9_]*/i, /\bSP_[A-Z0-9_]*/i]

// Schemas/bancos de sistema
const FORBIDDEN_SCHEMAS = [
  /\bSYS\s*\./i,
  /\bMASTER\s*\.\./i,
  /\bMSDB\s*\.\./i,
  /\bTEMPDB\s*\.\./i,
  /\bINFORMATION_SCHEMA\s*\./i,
]

/** Remove literais de string ('...', com '' escapado) para o scan de keywords. */
export function stripStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''")
}

function firstToken(sql: string): string {
  const match = sql.trimStart().match(/^[A-Za-z_]+/)
  return (match?.[0] ?? '').toUpperCase()
}

/**
 * Valida o texto do SQL contra as regras da guarda + as exigências do
 * contrato (placeholders coerentes com o escopo). Retorna a lista de
 * violações — vazia = aprovado.
 */
export function validateSql(
  rawSql: string,
  contract: QueryContract,
  scope: IntelQueryScope
): SqlViolation[] {
  const violations: SqlViolation[] = []
  const sql = rawSql.trim()

  if (sql.length === 0) {
    return [{ code: 'empty', message: 'Consulta vazia' }]
  }

  // Comentários são proibidos por inteiro (linha e bloco)
  if (sql.includes('--')) {
    violations.push({ code: 'line_comment', message: 'Comentário de linha (--) não é permitido' })
  }
  if (sql.includes('/*') || sql.includes('*/')) {
    violations.push({
      code: 'block_comment',
      message: 'Comentário de bloco (/* */) não é permitido',
    })
  }
  if (sql.includes(';')) {
    violations.push({ code: 'semicolon', message: 'Ponto e vírgula (;) não é permitido' })
  }

  const token = firstToken(sql)
  if (token !== 'SELECT' && token !== 'WITH') {
    violations.push({
      code: 'not_select',
      message: 'A consulta precisa começar com SELECT (ou WITH para CTEs)',
    })
  }

  // Scan de keywords sobre o SQL sem literais de string
  const scannable = stripStringLiterals(sql).toUpperCase()

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`)
    if (pattern.test(scannable)) {
      violations.push({
        code: `forbidden_${keyword.toLowerCase()}`,
        message: `Palavra proibida: ${keyword}`,
      })
    }
  }

  for (const pattern of FORBIDDEN_PREFIXES) {
    const match = scannable.match(pattern)
    if (match) {
      violations.push({
        code: 'forbidden_system_proc',
        message: `Objeto de sistema não permitido: ${match[0]}`,
      })
    }
  }

  for (const pattern of FORBIDDEN_SCHEMAS) {
    if (pattern.test(scannable)) {
      violations.push({
        code: 'forbidden_system_schema',
        message: 'Acesso a schema/banco de sistema não é permitido',
      })
    }
  }

  if (/\bFOR\s+(XML|JSON)\b/.test(scannable)) {
    violations.push({ code: 'forbidden_for_clause', message: 'FOR XML/JSON não é permitido' })
  }

  // CTE (D6): todo corpo precisa ser SELECT — com DML barrado acima, resta
  // garantir que após cada abre-parênteses de CTE e após o fecho vem SELECT/WITH
  if (token === 'WITH' && !/\)\s*(,|SELECT\b)/.test(scannable.replace(/\s+/g, ' '))) {
    // heurística: um WITH válido termina as CTEs com ")" seguido de "," (próxima CTE)
    // ou de SELECT final; sem isso, o statement final não é um SELECT
    violations.push({
      code: 'cte_without_final_select',
      message: 'WITH precisa terminar em um SELECT final',
    })
  }

  // ─── Placeholders × contrato/escopo ───
  const present = findPlaceholders(sql)

  for (const name of present) {
    if (!KNOWN_PLACEHOLDERS.includes(name as never)) {
      violations.push({
        code: 'unknown_placeholder',
        message: `Placeholder desconhecido: {{${name}}}`,
      })
      continue
    }
    const allowed = [...contract.requiredPlaceholders, ...contract.optionalPlaceholders]
    if (!allowed.includes(name as never)) {
      violations.push({
        code: 'placeholder_not_allowed',
        message: `{{${name}}} não é permitido no contrato ${contract.name}`,
      })
    }
  }

  for (const required of contract.requiredPlaceholders) {
    if (!present.includes(required)) {
      violations.push({
        code: 'missing_placeholder',
        message: `Placeholder obrigatório ausente: {{${required}}}`,
      })
    }
  }

  // Regra do doc §3.2: escopo ALL não pode ter {{VENDEDOR}}; PER_SELLER precisa
  if (scope === 'ALL' && present.includes('VENDEDOR')) {
    violations.push({
      code: 'vendor_in_all_scope',
      message: 'Consulta de escopo "todos" não pode usar {{VENDEDOR}}',
    })
  }
  if (scope === 'PER_SELLER' && !present.includes('VENDEDOR')) {
    violations.push({
      code: 'missing_vendor_in_per_seller',
      message: 'Consulta por vendedor precisa usar {{VENDEDOR}}',
    })
  }

  if (!contract.allowedScopes.includes(scope)) {
    violations.push({
      code: 'scope_not_allowed',
      message: `Escopo ${scope} não é permitido para ${contract.name}`,
    })
  }

  return violations
}
