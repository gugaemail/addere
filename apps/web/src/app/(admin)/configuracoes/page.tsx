'use client'

// Configurações da empresa (E22): o ADMIN ajusta sync, tom e retenção e
// registra o aceite do aviso LGPD por conta própria. Ligar e desligar a
// Inteligência não é mais dele: ela entra pelo contrato (plano 014) e aqui
// aparece só como status. O formulário é o mesmo da aba Inteligência de
// Empresas (components/intel/IntelConfigForm), só muda de onde vem o tenant.
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
          Camada de Inteligência da sua empresa: horários do sync, tom das mensagens e retenção de
          dados. A Inteligência entra pelo contrato.
        </p>
      </div>

      <IntelConfigForm />
    </div>
  )
}
