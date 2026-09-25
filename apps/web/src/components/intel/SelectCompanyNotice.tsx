'use client'

// Aviso das telas da Inteligência quando o SUPERADMIN ainda não escolheu a
// empresa ativa. Sem ele as telas caíam no estado vazio genérico e a causa
// real ficava invisível.
import { Building2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export function SelectCompanyNotice() {
  return (
    <Card className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
        <Building2 size={18} strokeWidth={1.5} className="text-brand" aria-hidden />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Selecione a empresa ativa
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Escolha a empresa em &quot;Empresa ativa&quot;, no topo da barra lateral, para ver os
          dados da Inteligência dela.
        </p>
      </div>
    </Card>
  )
}
