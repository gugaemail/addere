// Filtro, ordenação e paginação em memória — puro, testado em __tests__/table.ts.
// Vivia em app/(admin)/empresas/[id]/tabs/shared.tsx, preso às abas da empresa;
// saiu de lá quando a tela de Usuários passou a precisar do mesmo comportamento.

export type SortConfig = { col: string; dir: 'asc' | 'desc' } | null
export type ModalState<T> = { mode: 'create' | 'edit' | 'copy' | 'view'; item?: T } | null

export const PAGE_SIZE = 15

export function applyTable<T>(
  items: T[],
  filter: (item: T) => boolean,
  sort: SortConfig,
  getField: (item: T, col: string) => string,
  page: number
): { rows: T[]; total: number; pages: number } {
  let filtered = items.filter(filter)
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = getField(a, sort.col)
      const bv = getField(b, sort.col)
      return sort.dir === 'asc'
        ? av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' })
        : bv.localeCompare(av, 'pt-BR', { sensitivity: 'base' })
    })
  }
  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Apagar registros pode deixar a página atual além do fim — sem o clamp a
  // tela ficaria vazia com a paginação dizendo que há resultados.
  const safePage = Math.min(Math.max(1, page), pages)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  return { rows, total, pages }
}

/** Ciclo do clique no cabeçalho: asc → desc → sem ordenação. */
export function toggleSort(current: SortConfig, col: string): SortConfig {
  if (current?.col !== col) return { col, dir: 'asc' }
  if (current.dir === 'asc') return { col, dir: 'desc' }
  return null
}
