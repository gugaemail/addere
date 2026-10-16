'use client'

import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { AdminLicenseRequests } from '@/components/billing/AdminLicenseRequests'
import { SeatHoldersList } from '@/components/billing/SeatHoldersList'
import { SeatMeter } from '@/components/billing/SeatMeter'
import { useLicenseRequests, useSeats } from '@/hooks/useBilling'
import { getApiErrorMessage } from '@/lib/api'

// Aba Licenças da ficha do cliente (plano 015): o medidor, quem ocupa licença
// e os pedidos de licenças desta empresa, com as mesmas ações de Solicitações.
export function LicencasTab({ companyId }: { companyId: string }) {
  const seats = useSeats(companyId)
  const requests = useLicenseRequests({ companyId })

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">Licenças</h2>
        {seats.isLoading ? (
          <Spinner />
        ) : seats.error || !seats.data ? (
          <p className="text-sm text-danger">
            {getApiErrorMessage(seats.error, 'Erro ao carregar as licenças')}
          </p>
        ) : (
          <>
            <SeatMeter seats={seats.data} />
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Vendedores e gerentes ativos ocupam licença; administradores não. Para passar do
              limite sem pedido do cliente, proponha um aditivo na aba Contrato.
            </p>
          </>
        )}
      </Card>

      {seats.data && <SeatHoldersList holders={seats.data.holders} />}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Pedidos de licenças</h2>
        {requests.isLoading ? (
          <Spinner />
        ) : requests.error ? (
          <p className="text-sm text-danger">
            {getApiErrorMessage(requests.error, 'Erro ao carregar os pedidos')}
          </p>
        ) : (
          <AdminLicenseRequests
            requests={requests.data ?? []}
            showCompany={false}
            emptyMessage="Esta empresa ainda não pediu licenças adicionais."
          />
        )}
      </section>
    </div>
  )
}
