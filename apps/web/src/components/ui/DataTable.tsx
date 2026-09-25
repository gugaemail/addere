'use client'

// Componentes de tabela do painel — busca, ordenação, paginação e estados
// vazios. Viviam em empresas/[id]/tabs/shared.tsx, presos às abas da empresa;
// a tela de Usuários passou a precisar dos mesmos, então subiram para cá.
// A lógica pura (filtrar/ordenar/paginar) mora em lib/table.ts.
import { ChevronDown, ChevronUp, ChevronsUpDown, PackageOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { PAGE_SIZE, type SortConfig } from '@/lib/table'

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative max-w-xs">
      <Search
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none"
        strokeWidth={2}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Pesquisar…'}
        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  )
}

// Header de coluna ordenável — usado dentro de Column.header do ui/Table

export function SortHeader({
  label,
  col,
  sort,
  onSort,
}: {
  label: string
  col: string
  sort: SortConfig
  onSort: (col: string) => void
}) {
  const active = sort?.col === col
  const iconClass = cn(
    'w-3.5 h-3.5 shrink-0 transition-colors',
    active ? 'text-brand' : 'text-[var(--text-muted)]'
  )
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="inline-flex items-center gap-1 uppercase tracking-wider font-medium cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
    >
      {label}
      {!active && <ChevronsUpDown className={iconClass} strokeWidth={2} />}
      {active && sort?.dir === 'asc' && <ChevronUp className={iconClass} strokeWidth={2} />}
      {active && sort?.dir === 'desc' && <ChevronDown className={iconClass} strokeWidth={2} />}
    </button>
  )
}

export function Pagination({
  page,
  total,
  pages,
  onPage,
}: {
  page: number
  total: number
  pages: number
  onPage: (p: number) => void
}) {
  if (pages <= 1 && total <= PAGE_SIZE) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
      <span>
        {total} registro{total !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="xs" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          Anterior
        </Button>
        <span className="px-1">
          Página {page} de {pages}
        </span>
        <Button
          variant="outline"
          size="xs"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}

// Estado vazio (sem registros) exibido no lugar da tabela

export function TableEmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
      <span className="text-[var(--text-muted)]">
        {icon ?? <PackageOpen className="w-9 h-9" strokeWidth={1.25} />}
      </span>
      <p className="font-semibold text-[var(--text-primary)] text-sm">{title}</p>
      <p className="text-xs text-[var(--text-muted)] max-w-xs">{description}</p>
    </div>
  )
}

// Estado "nenhum resultado" para busca sem correspondência

export function NoResultsState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
      <Search className="w-9 h-9 text-[var(--text-muted)]" strokeWidth={1.25} />
      <p className="font-semibold text-[var(--text-primary)] text-sm">Nenhum resultado</p>
      <p className="text-xs text-[var(--text-muted)] max-w-xs">Tente outros termos de busca.</p>
    </div>
  )
}
