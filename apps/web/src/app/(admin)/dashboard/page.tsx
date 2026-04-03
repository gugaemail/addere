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

  if (loading) {
    return <div className="text-gray-500 text-sm">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nova empresa
        </button>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total de empresas" value={companies.length} />
        <StatCard label="Ativas" value={companies.filter((c) => c.active).length} />
        <StatCard label="Inativas" value={companies.filter((c) => !c.active).length} />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Protheus</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Filiais</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Usuários</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Pedidos</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma empresa cadastrada ainda.
                </td>
              </tr>
            )}
            {companies.map((company) => (
              <tr
                key={company.id}
                onClick={() => router.push(`/empresas/${company.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900">{company.name}</td>
                <td className="px-4 py-3 text-gray-600">{company.cnpj}</td>
                <td className="px-4 py-3 text-gray-500">{company.idProtheus ?? '—'}</td>
                <td className="px-4 py-3 text-center text-gray-600">{company._count.branches}</td>
                <td className="px-4 py-3 text-center text-gray-600">{company._count.users}</td>
                <td className="px-4 py-3 text-center text-gray-600">{company._count.orders}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      company.active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {company.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}
