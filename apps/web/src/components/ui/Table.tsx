import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  className?: string
}

export function Table<T>({ columns, data, emptyMessage = 'Nenhum registro encontrado.', className }: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-subtle)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
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
            data.map((row, i) => (
              <tr key={i} className="bg-[var(--bg-surface)] transition-colors hover:bg-[var(--bg-subtle)]">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-[var(--text-secondary)]', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
