import { Fragment } from 'react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  // ReactNode para permitir headers interativos (ex.: ordenação)
  header: React.ReactNode
  render: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  className?: string
  /** Chave estável por linha (default: índice) */
  rowKey?: (row: T, index: number) => string
  /** Torna a linha clicável (ex.: expandir detalhe) */
  onRowClick?: (row: T) => void
  /** Conteúdo extra renderizado numa linha abaixo da atual quando não-nulo */
  renderExpanded?: (row: T) => React.ReactNode
  /** Classe extra por linha (ex.: destacar linhas inativas) */
  rowClassName?: (row: T) => string | undefined
}

export function Table<T>({
  columns,
  data,
  emptyMessage = 'Nenhum registro encontrado.',
  className,
  rowKey,
  onRowClick,
  renderExpanded,
  rowClassName,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl', className)}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)]">
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
            {columns.map((col) => (
              <th key={col.key} className={cn('px-4 py-3 font-medium', col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-[var(--text-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => {
              const key = rowKey ? rowKey(row, i) : String(i)
              const expanded = renderExpanded?.(row)
              return (
                <Fragment key={key}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-subtle)]',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-3 text-[var(--text-secondary)]', col.className)}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expanded != null && expanded !== false && (
                    <tr>
                      <td colSpan={columns.length} className="px-4 pb-4 bg-[var(--bg-subtle)]">
                        {expanded}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
