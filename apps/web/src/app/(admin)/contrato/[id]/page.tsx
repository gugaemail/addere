'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CONTRACT_DOCUMENT_KIND_LABELS } from '@addere/types'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { AcceptDocumentPanel } from '@/components/contracts/AcceptDocumentPanel'
import { AcceptanceRecord } from '@/components/contracts/AcceptanceRecord'
import { ContractDocumentView } from '@/components/contracts/ContractDocumentView'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminDocument, useMyBilling, useMyDocument } from '@/hooks/useContracts'
import { getApiErrorMessage } from '@/lib/api'

// O link do e-mail (plano 014). SENT: a área de aceite, nos três modos;
// ACCEPTED: o texto com o registro do aceite; CANCELLED: o aviso de que foi
// substituído. O SUPERADMIN vê qualquer documento, só para leitura.
export default function ContratoDocumentoPage() {
  const { id } = useParams<{ id: string }>()
  const { isSuperAdmin } = useAuth()
  const mine = useMyDocument(id, !isSuperAdmin)
  const billing = useMyBilling(!isSuperAdmin)
  const admin = useAdminDocument(id, isSuperAdmin)
  const query = isSuperAdmin ? admin : mine
  const doc = query.data

  if (query.isLoading || (!isSuperAdmin && billing.isLoading)) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (query.error || !doc) {
    return (
      <Card className="max-w-2xl p-6">
        <p className="font-semibold text-[var(--text-primary)]">Documento não encontrado</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(query.error, 'Este documento não existe ou não é da sua empresa.')}
        </p>
        <Link href="/contrato" className="mt-3 inline-block text-sm font-medium text-brand">
          Ir para Contrato →
        </Link>
      </Card>
    )
  }

  if (doc.status === 'CANCELLED') {
    return (
      <Card className="max-w-2xl p-6">
        <p className="font-semibold text-[var(--text-primary)]">
          Este documento foi cancelado ou substituído.
        </p>
        <Link
          href="/contrato"
          className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
        >
          Ver o contrato atual →
        </Link>
      </Card>
    )
  }

  if (doc.status === 'SENT' && !isSuperAdmin) {
    return (
      <div className="max-w-4xl">
        <AcceptDocumentPanel
          doc={doc}
          designatedAdmin={billing.data?.designatedAdmin ?? null}
          onChanged={() => {
            void mine.refetch()
            void billing.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          {CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]}
        </h1>
        <Link
          href={`/contrato/${doc.id}/imprimir`}
          className="text-sm font-medium text-brand hover:underline"
        >
          Imprimir / salvar PDF
        </Link>
      </div>
      <Card className="p-4 sm:p-6">
        <ContractDocumentView doc={doc} />
        <AcceptanceRecord doc={doc} />
      </Card>
    </div>
  )
}
