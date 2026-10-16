'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import type { PendingDocumentRef } from '@addere/types'
import { pendingBannerText, pendingDocumentMode } from '@/lib/contract-acceptance'

// Faixa do painel do ADMIN enquanto houver contrato ou aditivo pendente (plano
// 014). Para o administrador indicado, "… aguardando seu aceite" e "Ler e
// aceitar"; para os outros ADMINs, "… aguardando o aceite de {nome}" e "Ver
// contrato". Some em /contrato (o layout não a mostra lá).
export function PendingContractBanner({
  pending,
  userId,
}: {
  pending: PendingDocumentRef
  userId: string
}) {
  const mode = pendingDocumentMode(userId, pending.designatedAdmin)
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm print:hidden"
    >
      <p className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
        <Info size={16} strokeWidth={1.5} className="shrink-0 text-brand" aria-hidden />
        {pendingBannerText(pending.kind, mode, pending.designatedAdmin?.name)}
      </p>
      <Link
        href={`/contrato/${pending.id}`}
        className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm font-medium text-white hover:opacity-90"
      >
        {mode === 'accept' ? 'Ler e aceitar' : 'Ver contrato'}
      </Link>
    </div>
  )
}
