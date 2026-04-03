'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CreateBranchModal } from './CreateBranchModal'
import { CreateUserModal } from './CreateUserModal'

interface Branch {
  id: string
  name: string
  cnpj: string | null
  idProtheus: string | null
  active: boolean
}

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'SALESPERSON'
  active: boolean
  createdAt: string
}

interface CompanyDetail {
  id: string
  name: string
  cnpj: string
  idProtheus: string | null
  active: boolean
  branches: Branch[]
  users: User[]
  _count: { orders: number }
}

export default function EmpresaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)

  async function fetchCompany() {
    try {
      const { data } = await api.get<CompanyDetail>(`/companies/${id}`)
      setCompany(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchCompany() }, [id])

  async function toggleCompany(active: boolean) {
    await api.patch(`/companies/${id}/active`, { active })
    fetchCompany()
  }

  async function toggleBranch(branchId: string, active: boolean) {
    await api.patch(`/companies/${id}/branches/${branchId}/active`, { active })
    fetchCompany()
  }

  async function toggleUser(userId: string, active: boolean) {
    await api.patch(`/companies/${id}/users/${userId}/active`, { active })
    fetchCompany()
  }

  if (loading) return <div className="text-gray-500 text-sm">Carregando...</div>
  if (!company) return <div className="text-red-500 text-sm">Empresa não encontrada.</div>

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-blue-600 hover:underline mb-2 block"
          >
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {company.cnpj}
            {company.idProtheus && <span className="ml-3 text-gray-400">Protheus: {company.idProtheus}</span>}
          </p>
        </div>
        <button
          onClick={() => toggleCompany(!company.active)}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
            company.active
              ? 'border-red-300 text-red-600 hover:bg-red-50'
              : 'border-green-300 text-green-600 hover:bg-green-50'
          }`}
        >
          {company.active ? 'Desativar empresa' : 'Ativar empresa'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Filiais" value={company.branches.length} />
        <StatCard label="Usuários ativos" value={company.users.filter((u) => u.active).length} />
        <StatCard label="Pedidos" value={company._count.orders} />
      </div>

      {/* Filiais */}
      <Section
        title="Filiais"
        action={{ label: '+ Nova filial', onClick: () => setShowBranchModal(true) }}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Protheus</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {company.branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Nenhuma filial.</td>
              </tr>
            )}
            {company.branches.map((branch) => (
              <tr key={branch.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{branch.name}</td>
                <td className="px-4 py-3 text-gray-500">{branch.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{branch.idProtheus ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge active={branch.active} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ToggleButton active={branch.active} onClick={() => toggleBranch(branch.id, !branch.active)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Usuários */}
      <Section
        title="Usuários"
        action={{ label: '+ Novo usuário', onClick: () => setShowUserModal(true) }}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Perfil</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {company.users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Nenhum usuário.</td>
              </tr>
            )}
            {company.users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3 text-gray-500">
                  {user.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge active={user.active} />
                </td>
                <td className="px-4 py-3 text-right">
                  <ToggleButton active={user.active} onClick={() => toggleUser(user.id, !user.active)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {showBranchModal && (
        <CreateBranchModal
          companyId={id}
          onClose={() => setShowBranchModal(false)}
          onCreated={() => { setShowBranchModal(false); fetchCompany() }}
        />
      )}

      {showUserModal && (
        <CreateUserModal
          companyId={id}
          onClose={() => setShowUserModal(false)}
          onCreated={() => { setShowUserModal(false); fetchCompany() }}
        />
      )}
    </div>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          onClick={action.onClick}
          className="text-sm text-blue-600 hover:underline"
        >
          {action.label}
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function ToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${
        active
          ? 'border-red-200 text-red-500 hover:bg-red-50'
          : 'border-green-200 text-green-600 hover:bg-green-50'
      }`}
    >
      {active ? 'Desativar' : 'Ativar'}
    </button>
  )
}
