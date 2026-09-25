// Substituição de placeholders nas consultas SQL da camada de Inteligência.
// Puro (sem I/O) — testável no CI sem banco.
//
// Regra de segurança (§2.7/E2 do plano): só valores gerados pelo Addere entram
// no SQL, e mesmo eles passam por regex estrita + escape de aspas. Nunca
// concatenar input de usuário.

export type PlaceholderName = 'FILIAL' | 'DATA_INI' | 'DATA_FIM' | 'HOJE' | 'VENDEDOR' | 'PRODUTO'

export const KNOWN_PLACEHOLDERS: PlaceholderName[] = [
  'FILIAL',
  'DATA_INI',
  'DATA_FIM',
  'HOJE',
  'VENDEDOR',
  'PRODUTO',
]

// Códigos Protheus (filial, vendedor, produto): alfanumérico + espaço, 1–20 chars.
// Mesma regex do Zod de Branch.idProtheus/User.idVendProt (E1c).
const CODE_PATTERN = /^[A-Za-z0-9 ]{1,20}$/
const DATE_PATTERN = /^\d{8}$/ // YYYYMMDD

export interface PlaceholderValues {
  /** Códigos das filiais ativas com idProtheus (vira `'01','02'`) */
  branches?: string[]
  dataIni?: string // YYYYMMDD
  dataFim?: string // YYYYMMDD
  hoje?: string // YYYYMMDD
  vendedor?: string
  produto?: string
}

export interface SubstitutionResult {
  sql: string
  errors: string[]
}

function quoteCode(value: string): string {
  // A regex já proíbe aspas; o escape é cinto-e-suspensório
  return `'${value.replace(/'/g, "''")}'`
}

function validCode(value: string): boolean {
  return CODE_PATTERN.test(value)
}

/** Encontra os placeholders presentes no SQL (inclusive desconhecidos). */
export function findPlaceholders(sql: string): string[] {
  const found = new Set<string>()
  for (const match of sql.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
    found.add(match[1].toUpperCase())
  }
  return Array.from(found)
}

/**
 * Substitui os placeholders conhecidos. Retorna erros (sem lançar) quando:
 * valor ausente para placeholder usado, valor com formato inválido, ou
 * placeholder desconhecido.
 */
export function substitutePlaceholders(sql: string, values: PlaceholderValues): SubstitutionResult {
  const errors: string[] = []
  const present = findPlaceholders(sql)

  for (const name of present) {
    if (!KNOWN_PLACEHOLDERS.includes(name as PlaceholderName)) {
      errors.push(`Placeholder desconhecido: {{${name}}}`)
    }
  }

  const replacements = new Map<PlaceholderName, string | null>()

  if (present.includes('FILIAL')) {
    const branches = values.branches ?? []
    if (branches.length === 0) {
      errors.push('Nenhuma filial ativa com código Protheus para substituir {{FILIAL}}')
      replacements.set('FILIAL', null)
    } else {
      const invalid = branches.filter((code) => !validCode(code))
      if (invalid.length > 0) {
        errors.push(`Código de filial inválido: ${invalid.join(', ')}`)
        replacements.set('FILIAL', null)
      } else {
        replacements.set('FILIAL', branches.map(quoteCode).join(','))
      }
    }
  }

  const dateFields: [PlaceholderName, string | undefined][] = [
    ['DATA_INI', values.dataIni],
    ['DATA_FIM', values.dataFim],
    ['HOJE', values.hoje],
  ]
  for (const [name, value] of dateFields) {
    if (!present.includes(name)) continue
    if (!value || !DATE_PATTERN.test(value)) {
      errors.push(`Valor inválido para {{${name}}} (esperado YYYYMMDD)`)
      replacements.set(name, null)
    } else {
      replacements.set(name, quoteCode(value))
    }
  }

  const codeFields: [PlaceholderName, string | undefined][] = [
    ['VENDEDOR', values.vendedor],
    ['PRODUTO', values.produto],
  ]
  for (const [name, value] of codeFields) {
    if (!present.includes(name)) continue
    if (!value || !validCode(value)) {
      errors.push(`Valor inválido para {{${name}}}`)
      replacements.set(name, null)
    } else {
      replacements.set(name, quoteCode(value))
    }
  }

  let result = sql
  for (const [name, replacement] of replacements) {
    if (replacement === null) continue
    result = result.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'gi'), replacement)
  }

  // Sobrou {{...}} sem substituição (erro acima ou placeholder desconhecido)
  if (errors.length === 0 && /\{\{/.test(result)) {
    errors.push('Restaram placeholders sem substituição no SQL')
  }

  return { sql: result, errors }
}

/** Data civil em America/Sao_Paulo no formato YYYYMMDD (dia do plano — §8 timezone). */
export function formatDateYmdSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}${get('month')}${get('day')}`
}
