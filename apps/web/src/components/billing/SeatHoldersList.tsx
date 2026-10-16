'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SeatHolder } from '@addere/types'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { profileLabel } from '@/lib/user-profile'

// "Quem ocupa licença" (plano 015): os vendedores e gerentes ativos que o
// GET /billing/me/seats devolve, recolhível. Administradores não aparecem
// porque não ocupam licença.
export function SeatHoldersList({ holders }: { holders: SeatHolder[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="p-4 sm:p-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Quem ocupa licença ({holders.length})
        </h2>
        <span className="flex items-center gap-1 text-sm font-medium text-brand">
          {open ? 'ocultar lista' : 'ver lista'}
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className={cn('transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>
      {open &&
        (holders.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Nenhum vendedor ou gerente ativo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {holders.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {h.name}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{h.email}</p>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  {profileLabel({ role: 'SALESPERSON', intelManager: h.intelManager })}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Card>
  )
}
