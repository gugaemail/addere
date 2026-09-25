'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// Boundary de erro do painel admin (App Router)
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <p className="text-base font-semibold text-[var(--text-primary)]">Algo deu errado</p>
      <p className="text-sm text-[var(--text-muted)] max-w-sm">
        {error.message || 'Erro inesperado ao carregar esta página.'}
      </p>
      <Button onClick={reset} leftIcon={RefreshCw} className="mt-2">
        Tentar novamente
      </Button>
    </div>
  )
}
