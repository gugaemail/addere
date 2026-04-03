'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CreateBranchModal } from './CreateBranchModal'
import { CreateUserModal } from './CreateUserModal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string; name: string; cnpj: string | null; idProtheus: string | null; active: boolean
}
interface User {
  id: string; name: string; email: string; role: 'ADMIN' | 'SALESPERSON'; active: boolean
}
interface Customer {
  id: string; name: string; document: string | null; email: string | null; phone: string | null
  protheusCode: string | null; active: boolean; createdAt: string
}
interface Product {
  id: string; name: string; protheusCode: string | null; price: string; unit: string
  stock: string; active: boolean
}
interface OrderItem {
  id: string; quantity: string; unitPrice: string; discount: string; total: string
  product: { id: string; name: string; unit: string }
}
interface Order {
  id: string; status: string; total: string; notes: string | null; createdAt: string
  customer: { id: string; name: string }
  user: { id: string; name: string }
  branch: { id: string; name: string }
  items: OrderItem[]
}
interface CompanyDetail {
  id: string; name: string; cnpj: string; idProtheus: string | null; active: boolean
  branches: Branch[]; users: User[]; _count: { orders: number }
}

type Tab = 'filiais' | 'usuarios' | 'clientes' | 'produtos' | 'pedidos'

// ─── Página ───────────────────────────────────────────────────────────────────

export default function EmpresaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('filiais')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)

  async function fetchCompany() {
    const { data } = await api.get<CompanyDetail>(`/companies/${id}`)
    setCompany(data)
    setLoading(false)
  }

  async function fetchCustomers() {
    const { data } = await api.get<Customer[]>(`/companies/${id}/customers`)
    setCustomers(data)
  }

  async function fetchProducts() {
    const { data } = await api.get<Product[]>(`/companies/${id}/products`)
    setProducts(data)
  }

  async function fetchOrders() {
    const { data } = await api.get<Order[]>(`/companies/${id}/orders`)
    setOrders(data)
  }

  useEffect(() => { fetchCompany() }, [id])

  useEffect(() => {
    if (tab === 'clientes') fetchCustomers()
    if (tab === 'produtos') fetchProducts()
    if (tab === 'pedidos') fetchOrders()
  }, [tab])

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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'filiais', label: `Filiais (${company.branches.length})` },
    { key: 'usuarios', label: `Usuários (${company.users.length})` },
    { key: 'clientes', label: 'Clientes' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'pedidos', label: 'Pedidos' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline mb-2 block">
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
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${company.active ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
        >
          {company.active ? 'Desativar empresa' : 'Ativar empresa'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Filiais" value={company.branches.length} />
        <StatCard label="Usuários" value={company.users.length} />
        <StatCard label="Pedidos" value={company._count.orders} />
        <StatCard label="Status" value={company.active ? 'Ativa' : 'Inativa'} text />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo das tabs */}
      {tab === 'filiais' && (
        <TabSection action={{ label: '+ Nova filial', onClick: () => setShowBranchModal(true) }}>
          <Table
            headers={['Nome', 'CNPJ', 'Protheus', 'Status', '']}
            empty={company.branches.length === 0}
          >
            {company.branches.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                <td className="px-4 py-3 text-gray-500">{b.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{b.idProtheus ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge active={b.active} /></td>
                <td className="px-4 py-3 text-right"><ToggleBtn active={b.active} onClick={() => toggleBranch(b.id, !b.active)} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'usuarios' && (
        <TabSection action={{ label: '+ Novo usuário', onClick: () => setShowUserModal(true) }}>
          <Table headers={['Nome', 'E-mail', 'Perfil', 'Status', '']} empty={company.users.length === 0}>
            {company.users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3 text-gray-500">{u.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}</td>
                <td className="px-4 py-3"><StatusBadge active={u.active} /></td>
                <td className="px-4 py-3 text-right"><ToggleBtn active={u.active} onClick={() => toggleUser(u.id, !u.active)} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'clientes' && (
        <TabSection>
          <Table headers={['Nome', 'Documento', 'E-mail', 'Telefone', 'Protheus', 'Status']} empty={customers.length === 0}>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.document ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">{c.protheusCode ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge active={c.active} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'produtos' && (
        <TabSection>
          <Table headers={['Nome', 'Protheus', 'Unidade', 'Preço', 'Estoque', 'Status']} empty={products.length === 0}>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-400">{p.protheusCode ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                <td className="px-4 py-3 text-gray-700">R$ {Number(p.price).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-500">{Number(p.stock).toFixed(3)}</td>
                <td className="px-4 py-3"><StatusBadge active={p.active} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'pedidos' && (
        <TabSection>
          <Table headers={['#', 'Cliente', 'Vendedor', 'Filial', 'Itens', 'Total', 'Status', 'Data']} empty={orders.length === 0}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{o.customer.name}</td>
                <td className="px-4 py-3 text-gray-500">{o.user.name}</td>
                <td className="px-4 py-3 text-gray-500">{o.branch.name}</td>
                <td className="px-4 py-3 text-center text-gray-600">{o.items.length}</td>
                <td className="px-4 py-3 text-gray-700">R$ {Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {showBranchModal && (
        <CreateBranchModal companyId={id} onClose={() => setShowBranchModal(false)} onCreated={() => { setShowBranchModal(false); fetchCompany() }} />
      )}
      {showUserModal && (
        <CreateUserModal companyId={id} onClose={() => setShowUserModal(false)} onCreated={() => { setShowUserModal(false); fetchCompany() }} />
      )}
    </div>
  )
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function StatCard({ label, value, text }: { label: string; value: string | number; text?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 font-bold text-gray-900 ${text ? 'text-lg' : 'text-3xl'}`}>{value}</p>
    </div>
  )
}

function TabSection({ children, action }: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div>
      {action && (
        <div className="flex justify-end mb-3">
          <button onClick={action.onClick} className="text-sm text-blue-600 hover:underline">{action.label}</button>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">{children}</div>
    </div>
  )
}

function Table({ headers, empty, children }: { headers: string[]; empty: boolean; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>{headers.map((h) => <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {empty ? (
          <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
        ) : children}
      </tbody>
    </table>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    SYNCED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-500',
  }
  const labels: Record<string, string> = {
    PENDING: 'Pendente', SYNCED: 'Sincronizado', CANCELLED: 'Cancelado',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function ToggleBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${active ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
    >
      {active ? 'Desativar' : 'Ativar'}
    </button>
  )
}
