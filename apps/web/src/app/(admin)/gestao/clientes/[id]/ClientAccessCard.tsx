'use client'

import { useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import type { ClientBlockState } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { clientAccessCardContent } from '@/lib/company-block'
import { cn } from '@/lib/utils'
import { UnblockClientModal } from './UnblockClientModal'

const DOT: Record<ReturnType<typeof clientAccessCardContent>['tone'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-[var(--text-muted)]',
}

// Cartão "Acesso" da ficha do cliente (plano 017), visível em todas as abas.
// Os estados saem de clientAccessCardContent (puro, testado). O único botão é
// "Liberar até…": o bloqueio por atraso é do agendador, depois do aviso de 10
// dias, e o bloqueio manual está desabilitado.
export function ClientAccessCard({
  companyId,
  block,
}: {
  companyId: string
  block: ClientBlockState
}) {
  const [releasing, setReleasing] = useState(false)
  const content = clientAccessCardContent(block)
  const Icon = block.blockedAt || !block.companyActive ? Lock : LockOpen

  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Icon size={14} strokeWidth={1.5} aria-hidden />
          Acesso
        </p>
        <p className="mt-1.5 flex items-start gap-2 text-sm font-medium text-[var(--text-primary)]">
          <span
            className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[content.tone])}
            aria-hidden
          />
          <span>{content.title}</span>
        </p>
        {content.detail && (
          <p className="mt-1 pl-4 text-sm text-[var(--text-secondary)]">{content.detail}</p>
        )}
      </div>
      {content.canRelease && (
        <Button variant="outline" size="sm" onClick={() => setReleasing(true)}>
          Liberar até…
        </Button>
      )}
      {releasing && (
        <UnblockClientModal companyId={companyId} onClose={() => setReleasing(false)} />
      )}
    </Card>
  )
}
