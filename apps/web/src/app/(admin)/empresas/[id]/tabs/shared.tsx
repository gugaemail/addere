'use client'

import { ChevronDown, ChevronUp, ChevronsUpDown, PackageOpen, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Tipos utilitários das abas ───────────────────────────────────────────────

export type ModalState<T> = { mode: 'create' | 'edit' | 'copy' | 'view'; item?: T } | null
export type SortConfig = { col: string; dir: 'asc' | 'desc' } | null

export const PAGE_SIZE = 15

// Filtra, ordena e pagina uma lista em memória (client-side)
export function applyTable<T>(
  items: T[],
  filter: (item: T) => boolean,
  sort: SortConfig,
  getField: (item: T, col: string) => string,
  page: number,
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
  const safePage = Math.min(Math.max(1, page), pages)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  return { rows, total, pages }
}

export function toggleSort(current: SortConfig, col: string): SortConfig {
  if (current?.col !== col) return { col, dir: 'asc' }
  if (current.dir === 'asc') return { col, dir: 'desc' }
  return null
}

// ─── Componentes compartilhados das abas ──────────────────────────────────────

export function TabSection({
  children, action, search, footer,
}: {
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
  search?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div>
      {(action || search) && (
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex-1">{search}</div>
          {action && (
            <button
              onClick={action.onClick}
              className="text-sm font-medium text-brand-600 hover:text-brand-500 transition-colors shrink-0"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
        {children}
        {footer}
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="relative max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" strokeWidth={2} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Pesquisar…'}
        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
      />
    </div>
  )
}

// Header de coluna ordenável — usado dentro de Column.header do ui/Table
export function SortHeader({ label, col, sort, onSort }: {
  label: string; col: string; sort: SortConfig; onSort: (col: string) => void
}) {
  const active = sort?.col === col
  const iconClass = cn('w-3.5 h-3.5 shrink-0 transition-colors', active ? 'text-brand-500' : 'text-[var(--text-muted)]')
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

export function Pagination({ page, total, pages, onPage }: {
  page: number; total: number; pages: number; onPage: (p: number) => void
}) {
  if (pages <= 1 && total <= PAGE_SIZE) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
      <span>{total} registro{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Anterior
        </button>
        <span className="px-1">Página {page} de {pages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  )
}

// Estado vazio (sem registros) exibido no lugar da tabela
export function TableEmptyState({ title, description, icon }: {
  title: string; description: string; icon?: React.ReactNode
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
