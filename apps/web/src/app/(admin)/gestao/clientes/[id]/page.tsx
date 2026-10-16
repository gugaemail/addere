'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { CLIENT_STATUS_LABELS } from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { Tabs } from '@/components/ui/Tabs'
import { getApiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import {
  CLIENT_STATUS_BADGE,
  LICENSE_TYPE_LABELS,
  currentTermsOf,
  proposedTermsOf,
} from '@/lib/billing-ui'
import { billingKeys, useClient } from '@/hooks/useBilling'
import { useToggleCompanyActive } from '@/hooks/useCompanies'
import type { InvoiceFilters } from '@/hooks/useInvoices'
import { InvoicesTable } from '@/components/billing/InvoicesTable'
import { ManualInvoiceModal } from '@/components/billing/InvoiceModals'
import { CadastroTab } from './tabs/CadastroTab'
import { ContratoTab } from './tabs/ContratoTab'
import { HistoricoTab } from './tabs/HistoricoTab'

type Tab = 'cadastro' | 'contrato' | 'faturas' | 'historico'

const TABS: { key: Tab; label: string }[] = [
  { key: 'cadastro', label: 'Cadastro' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'faturas', label: 'Faturas' },
  { key: 'historico', label: 'Histórico' },
]

// Aba Faturas (plano 016): a tabela de /gestao/faturas sem a coluna Cliente, e
// a fatura avulsa já com o cliente escolhido
function FaturasTab({ companyId }: { companyId: string }) {
  const [filters, setFilters] = useState<InvoiceFilters>({
    status: '',
    competence: '',
    companyId,
    page: 1,
    pageSize: 50,
  })
  const [showManual, setShowManual] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button leftIcon={Plus} onClick={() => setShowManual(true)}>
          Fatura avulsa
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-card">
        <InvoicesTable
          filters={filters}
          showCompany={false}
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
        />
      </div>
      {showManual && (
        <ManualInvoiceModal companyId={companyId} onClose={() => setShowManual(false)} />
      )}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-skeleton-pulse">
      <div className="h-6 w-48 bg-[var(--bg-subtle)] rounded" />
      <div className="h-8 w-64 bg-[var(--bg-subtle)] rounded" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-5 py-4 space-y-2"
          >
            <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded" />
            <div className="h-7 w-10 bg-[var(--bg-subtle)] rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// Ficha do cliente na Gestão Addere (plano 013): cadastro comercial, contrato
// em rascunho e histórico. A ficha técnica da empresa (filiais, Protheus,
// Inteligência) continua em /empresas/[id], pelo botão "Integração".
export default function ClientePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('cadastro')

  const { data: client, isLoading, error, refetch } = useClient(id)
  const toggleActive = useToggleCompanyActive()

  if (isLoading) return <PageSkeleton />

  if (error)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="font-semibold text-danger">Erro ao carregar o cliente</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(error, 'Erro ao carregar o cliente')}
        </p>
        <Button onClick={() => refetch()} className="mt-2">
          Tentar novamente
        </Button>
      </div>
    )

  if (!client)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <p className="font-semibold text-[var(--text-primary)]">Cliente não encontrado</p>
      </div>
    )

  const { company, profile, contract } = client
  const current = currentTermsOf(contract, new Date())
  const proposed = proposedTermsOf(contract)

  function handleToggleActive() {
    toggleActive.mutate(
      { id: company.id, active: !company.active },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
        onError: (err) =>
          toast.error(getApiErrorMessage(err, 'Erro ao alterar o status da empresa.')),
      }
    )
  }

  const packageValue = current
    ? `${current.packageName} · ${LICENSE_TYPE_LABELS[current.licenseType]}`
    : proposed
      ? `— (rascunho: ${proposed.packageName})`
      : '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ArrowLeft}
            onClick={() => router.push('/gestao/clientes')}
            className="mb-3 -ml-3 text-[var(--text-muted)] hover:text-brand font-medium"
          >
            Voltar
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {profile?.legalName ?? company.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
            {profile?.tradeName && <span>{profile.tradeName} ·</span>}
            <span>{company.cnpj}</span>
            {company.idProtheus && <span>· Protheus: {company.idProtheus}</span>}
            <Badge variant={CLIENT_STATUS_BADGE[client.status]}>
              {CLIENT_STATUS_LABELS[client.status]}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            rightIcon={ExternalLink}
            onClick={() => router.push(`/empresas/${company.id}`)}
          >
            Integração
          </Button>
          <Button
            variant={company.active ? 'danger-outline' : 'success-outline'}
            onClick={handleToggleActive}
            loading={toggleActive.isPending}
          >
            {company.active ? 'Desativar empresa' : 'Ativar empresa'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Licenças em uso"
          value={`${client.usedSeats} / ${client.seatLimit ?? 'sem limite'}`}
          text
        />
        <StatCard label="Pacote" value={packageValue} text />
        <StatCard
          label="Valor mensal"
          value={current ? formatCurrency(current.monthlyTotal) : '—'}
          text
        />
        <StatCard label="Empresa" value={company.active ? 'Ativa' : 'Inativa'} text />
      </div>

      <Tabs tabs={TABS} active={tab} onChange={(key) => setTab(key as Tab)} />

      {tab === 'cadastro' && <CadastroTab client={client} />}
      {/* key: o formulário recomeça se o contrato mudar de status (ex.: saiu do rascunho) */}
      {tab === 'contrato' && <ContratoTab key={contract?.status ?? 'NONE'} client={client} />}
      {tab === 'faturas' && <FaturasTab companyId={company.id} />}
      {tab === 'historico' && <HistoricoTab companyId={company.id} />}
    </div>
  )
}
