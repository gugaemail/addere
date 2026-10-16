'use client'

export const dynamic = 'force-dynamic'

import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { AcceptanceRecord } from '@/components/contracts/AcceptanceRecord'
import { ContractDocumentView } from '@/components/contracts/ContractDocumentView'
import { useAuth } from '@/contexts/AuthContext'
import { useAdminDocument, useMyDocument } from '@/hooks/useContracts'
import { getApiErrorMessage } from '@/lib/api'

// Impressão do documento com o registro do aceite (plano 014, contrato §14.4).
// O PDF sai pela impressão do navegador. No papel: sem sidebar nem barra do
// celular (print:hidden no layout), preto no branco mesmo no tema escuro e
// sem sombras nem bordas de card (@media print em globals.css).
export default function ContratoImprimirPage() {
  const { id } = useParams<{ id: string }>()
  const { isSuperAdmin } = useAuth()
  const mine = useMyDocument(id, !isSuperAdmin)
  const admin = useAdminDocument(id, isSuperAdmin)
  const query = isSuperAdmin ? admin : mine
  const doc = query.data

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (query.error || !doc) {
    return (
      <p className="text-sm text-danger">
        {getApiErrorMessage(query.error, 'Documento não encontrado.')}
      </p>
    )
  }

  return (
    <div className="print-document mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end print:hidden">
        <Button leftIcon={Printer} onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 sm:p-10 print:rounded-none print:border-0 print:p-0">
        <ContractDocumentView doc={doc} />
        <AcceptanceRecord doc={doc} />
      </div>
    </div>
  )
}
