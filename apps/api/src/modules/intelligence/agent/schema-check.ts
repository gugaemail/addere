// Conferência mínima do JSON do modelo contra o schema do prompt (plano 012) — puro.
// O structured output da API já garante o formato; isto é a rede para quando
// não garante (resposta truncada que ainda parseia, mudança de modelo): sem
// ela, o JSON virava `as T` e um `actions` que não fosse array quebrava a rota.
// Cobre só o subconjunto que os schemas de agent/prompts/ usam.

interface SchemaNode {
  type?: string
  properties?: Record<string, SchemaNode>
  required?: readonly string[]
  additionalProperties?: boolean
  items?: SchemaNode
  minItems?: number
  maxItems?: number
}

/** Lista de problemas — vazia quando o dado bate com o schema. */
export function schemaViolations(data: unknown, schema: unknown, path = '$'): string[] {
  const node = schema as SchemaNode
  switch (node.type) {
    case 'string':
      return typeof data === 'string' ? [] : [`${path} não é texto`]
    case 'number':
    case 'integer':
      return typeof data === 'number' && Number.isFinite(data) ? [] : [`${path} não é número`]
    case 'array': {
      if (!Array.isArray(data)) return [`${path} não é lista`]
      const problems: string[] = []
      if (node.minItems !== undefined && data.length < node.minItems) {
        problems.push(`${path} com menos de ${node.minItems} item(ns)`)
      }
      if (node.maxItems !== undefined && data.length > node.maxItems) {
        problems.push(`${path} com mais de ${node.maxItems} item(ns)`)
      }
      if (node.items) {
        data.forEach((item, i) => problems.push(...schemaViolations(item, node.items, `${path}[${i}]`)))
      }
      return problems
    }
    case 'object': {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        return [`${path} não é objeto`]
      }
      const record = data as Record<string, unknown>
      const problems: string[] = []
      for (const key of node.required ?? []) {
        if (!(key in record)) problems.push(`${path}.${key} ausente`)
      }
      for (const [key, value] of Object.entries(record)) {
        const child = node.properties?.[key]
        if (!child) {
          if (node.additionalProperties === false) problems.push(`${path}.${key} fora do schema`)
          continue
        }
        problems.push(...schemaViolations(value, child, `${path}.${key}`))
      }
      return problems
    }
    default:
      return []
  }
}
