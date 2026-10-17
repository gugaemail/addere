'use client'

import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'
import { useBillingOverdue } from '@/hooks/useInvoices'
import { billingBannerContent, todayYmdSaoPaulo } from '@/lib/company-block'
import { cn } from '@/lib/utils'

// Faixa de cobrança do ADMIN (plano 017): fatura vencida, a data prevista da
// suspensão e, com a empresa bloqueada, o tom de perigo. Os textos saem de
// billingBannerContent (puro, testado). O texto fica em --text-primary e o tom
// vai na borda, no fundo e no ícone: amarelo sobre claro não passa no AA.
export function BillingBanner() {
  const router = useRouter()
  const pathname = usePathname()
  const { isAdmin, companyAccess } = useAuth()
  const accessKey = companyAccess?.blocked ? (companyAccess.reason ?? 'BLOCKED') : 'FREE'
  const { data } = useBillingOverdue(isAdmin, accessKey)

  if (!isAdmin || !data) return null
  const content = billingBannerContent(data, todayYmdSaoPaulo())
  if (!content) return null
  const danger = content.tone === 'danger'

  return (
    <div
      role="status"
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm print:hidden',
        danger ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5'
      )}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 font-medium text-[var(--text-primary)]">
        <AlertTriangle
          size={16}
          strokeWidth={1.5}
          className={cn('mt-0.5 shrink-0', danger ? 'text-danger' : 'text-warning')}
          aria-hidden
        />
        <span>{content.text}</span>
      </p>
      {!pathname.startsWith('/plano') && (
        <Button
          size="sm"
          variant={danger ? 'danger-outline' : 'outline'}
          onClick={() => router.push('/plano')}
        >
          Ver Plano e cobrança
        </Button>
      )}
    </div>
  )
}
