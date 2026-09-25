'use client'

// Configurações da empresa (E22): o ADMIN liga a Inteligência, ajusta sync,
// tom e retenção e registra o aceite do aviso LGPD por conta própria — antes
// só o SUPERADMIN fazia isso, na aba Inteligência de Empresas. O formulário é
// o mesmo (components/intel/IntelConfigForm), só muda de onde vem o tenant.
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { needsActiveCompany } from '@/lib/intel-helpers'
import { IntelConfigForm } from '@/components/intel/IntelConfigForm'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'

export default function ConfiguracoesPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[var(--text-muted)]">Acesso restrito a administradores.</p>
      </div>
    )
  }

  if (needsActiveCompany(isSuperAdmin, companyId)) return <SelectCompanyNotice />

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Configurações
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Camada de Inteligência da sua empresa: ligar, horários do sync, tom das mensagens e
          retenção de dados.
        </p>
      </div>

      <IntelConfigForm />
    </div>
  )
}
