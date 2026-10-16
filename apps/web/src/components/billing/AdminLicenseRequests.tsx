'use client'

import { useState } from 'react'
import type { LicenseRequestDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { DecideLicenseRequestModal, type LicenseDecision } from './DecideLicenseRequestModal'
import { LicenseRequestsTable } from './LicenseRequestsTable'

// Pedidos de licenças com as ações do SUPERADMIN (plano 015): a mesma tabela e
// o mesmo modal em Gestão Addere › Solicitações e na aba Licenças da ficha.
export function AdminLicenseRequests({
  requests,
  showCompany = true,
  emptyMessage,
}: {
  requests: LicenseRequestDto[]
  showCompany?: boolean
  emptyMessage?: string
}) {
  const [deciding, setDeciding] = useState<{
    request: LicenseRequestDto
    decision: LicenseDecision
  } | null>(null)

  return (
    <>
      <LicenseRequestsTable
        requests={requests}
        variant="admin"
        showCompany={showCompany}
        emptyMessage={emptyMessage}
        actions={(r) =>
          r.status === 'PENDING' && (
            <>
              <Button size="sm" onClick={() => setDeciding({ request: r, decision: 'APPROVE' })}>
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="danger-outline"
                onClick={() => setDeciding({ request: r, decision: 'REJECT' })}
              >
                Recusar
              </Button>
            </>
          )
        }
      />
      {deciding && (
        <DecideLicenseRequestModal
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
        />
      )}
    </>
  )
}
