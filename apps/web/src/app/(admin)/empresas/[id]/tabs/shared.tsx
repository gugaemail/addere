'use client'

// Chrome das abas da empresa. Os utilitários de tabela subiram para
// lib/table.ts (puros) e components/ui/DataTable.tsx (componentes) quando a
// tela de Usuários passou a usá-los; ficam reexportados aqui para as abas
// continuarem importando de um lugar só.
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export { PAGE_SIZE, applyTable, toggleSort } from '@/lib/table'
export type { ModalState, SortConfig } from '@/lib/table'
export {
  SearchInput,
  SortHeader,
  Pagination,
  TableEmptyState,
  NoResultsState,
} from '@/components/ui/DataTable'

// ─── Componentes compartilhados das abas ──────────────────────────────────────

export function TabSection({
  children,
  action,
  search,
  footer,
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
            <Button
              variant="ghost"
              size="sm"
              leftIcon={Plus}
              onClick={action.onClick}
              className="shrink-0"
            >
              {action.label}
            </Button>
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
