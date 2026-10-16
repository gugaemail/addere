'use client'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { getApiErrorMessage } from '@/lib/api'
import { BILLING_EVENT_LABELS, billingFieldLabel } from '@/lib/billing-ui'
import { useClientEvents } from '@/hooks/useBilling'

// createdAt é um instante, não um @db.Date: aqui o fuso do navegador está certo
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Histórico da Gestão Addere: o que mudou e quem mudou. O evento guarda só os
// nomes dos campos, nunca os valores (LGPD).
export function HistoricoTab({ companyId }: { companyId: string }) {
  const { data: events = [], isLoading, error, refetch } = useClientEvents(companyId)

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-danger">
          {getApiErrorMessage(error, 'Erro ao carregar o histórico')}
        </p>
        <Button size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-[var(--text-muted)]">
        Nenhuma alteração registrada.
      </Card>
    )
  }

  return (
    <Card className="p-0">
      <ul className="divide-y divide-[var(--border)]">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)] sm:w-32 sm:pt-0.5">
              {dateTime.format(new Date(e.createdAt))}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {BILLING_EVENT_LABELS[e.type] ?? e.type}
              </p>
              {e.fields.length > 0 && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Campos: {e.fields.map(billingFieldLabel).join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm text-[var(--text-secondary)]">
              {e.actorName ?? 'Sistema'}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
