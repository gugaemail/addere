'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CreateCompanyModal } from './CreateCompanyModal'

interface CompanyItem {
  id: string
  name: string
  cnpj: string
  idProtheus: string | null
  active: boolean
  createdAt: string
  _count: { users: number; branches: number; orders: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  async function fetchCompanies() {
    try {
      const { data } = await api.get<CompanyItem[]>('/companies')
      setCompanies(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCompanies() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Empresas</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nova empresa
        </button>
      </div>

      {/* Cards resumo */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total de empresas" value={companies.length} accent="brand" />
          <StatCard label="Ativas" value={companies.filter((c) => c.active).length} accent="green" />
          <StatCard label="Inativas" value={companies.filter((c) => !c.active).length} accent="gray" />
        </div>
      )}

      {/* Tabela */}
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
        {loading ? (
          <TableSkeleton cols={7} rows={4} />
        ) : companies.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            }
            title="Nenhuma empresa cadastrada"
            description="Cadastre a primeira empresa para começar a gerenciar vendedores e pedidos."
            action={{ label: '+ Nova empresa', onClick: () => setShowModal(true) }}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">CNPJ</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Protheus</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--text-secondary)]">Filiais</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--text-secondary)]">Usuários</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--text-secondary)]">Pedidos</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {companies.map((company) => (
                <tr
                  key={company.id}
                  onClick={() => router.push(`/empresas/${company.id}`)}
                  className="hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{company.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{company.cnpj}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{company.idProtheus ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{company._count.branches}</td>
                  <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{company._count.users}</td>
                  <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{company._count.orders}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge active={company.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <CreateCompanyModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchCompanies() }}
        />
      )}
    </div>
  )
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: number; accent: 'brand' | 'green' | 'gray' }) {
  const accentClass = {
    brand: 'border-brand-500',
    green: 'border-green-500',
    gray:  'border-[var(--border)]',
  }[accent]

  return (
    <div className={`bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] border-l-2 ${accentClass} px-5 py-4`}>
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold tracking-tighter text-[var(--text-primary)] mt-1">{value}</p>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-5 py-4 space-y-2">
      <div className="h-3 w-24 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
      <div className="h-8 w-12 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" />
    </div>
  )
}

function TableSkeleton({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div className="w-full">
      <div className="bg-[var(--bg-subtle)] border-b border-[var(--border)] px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-[var(--border)] rounded animate-skeleton-pulse" style={{ width: `${60 + (i * 17) % 60}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex gap-4 border-b border-[var(--border)] last:border-0">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 bg-[var(--bg-subtle)] rounded animate-skeleton-pulse" style={{ width: `${50 + ((r + i) * 23) % 80}px` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  icon, title, description, action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="text-[var(--text-muted)]">{icon}</div>
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs mx-auto">{description}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-500 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-500/10 text-green-500' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
    }`}>
      {active ? 'Ativa' : 'Inativa'}
    </span>
  )
}
