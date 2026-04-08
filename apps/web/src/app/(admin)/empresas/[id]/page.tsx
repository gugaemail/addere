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
  apiToken: string | null; apiPord: string | null; apiCliente: string | null
  apiMetaVend: string | null; apiPedido: string | null; apiConsPed: string | null
  apiCondPag: string | null; apiTransp: string | null
  usrProtheus: string | null; passProtheus: string | null
}

interface SyncResult {
  synced: number; total: number; errors: string[]
}

type Tab = 'filiais' | 'usuarios' | 'clientes' | 'produtos' | 'pedidos' | 'protheus'

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
  const [syncingProducts, setSyncingProducts] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

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

  if (loading) return <PageSkeleton />
  if (!company) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <svg className="w-10 h-10 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <p className="font-semibold text-[var(--text-primary)]">Empresa não encontrada</p>
    </div>
  )

  async function syncProducts() {
    setSyncingProducts(true)
    setSyncResult(null)
    setSyncError(null)
    try {
      const { data } = await api.post<SyncResult>('/sync/products')
      setSyncResult(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao sincronizar'
      setSyncError(msg)
    } finally {
      setSyncingProducts(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'filiais',  label: `Filiais (${company.branches.length})` },
    { key: 'usuarios', label: `Usuários (${company.users.length})` },
    { key: 'clientes', label: 'Clientes' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'pedidos',  label: 'Pedidos' },
    { key: 'protheus', label: 'Protheus' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-brand-500 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Voltar
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{company.name}</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {company.cnpj}
            {company.idProtheus && <span className="ml-3">Protheus: {company.idProtheus}</span>}
          </p>
        </div>
        <button
          onClick={() => toggleCompany(!company.active)}
          className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
            company.active
              ? 'border-red-500/30 text-red-500 hover:bg-red-500/10'
              : 'border-green-500/30 text-green-500 hover:bg-green-500/10'
          }`}
        >
          {company.active ? 'Desativar empresa' : 'Ativar empresa'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Filiais"  value={company.branches.length} />
        <StatCard label="Usuários" value={company.users.length} />
        <StatCard label="Pedidos"  value={company._count.orders} />
        <StatCard label="Status"   value={company.active ? 'Ativa' : 'Inativa'} text />
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
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
            emptyTitle="Nenhuma filial"
            emptyDesc="Adicione a primeira filial desta empresa."
          >
            {company.branches.map((b) => (
              <tr key={b.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{b.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{b.cnpj ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{b.idProtheus ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge active={b.active} /></td>
                <td className="px-4 py-3 text-right"><ToggleBtn active={b.active} onClick={() => toggleBranch(b.id, !b.active)} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'usuarios' && (
        <TabSection action={{ label: '+ Novo usuário', onClick: () => setShowUserModal(true) }}>
          <Table
            headers={['Nome', 'E-mail', 'Perfil', 'Status', '']}
            empty={company.users.length === 0}
            emptyTitle="Nenhum usuário"
            emptyDesc="Adicione o primeiro usuário desta empresa."
          >
            {company.users.map((u) => (
              <tr key={u.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{u.name}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{u.email}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{u.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}</td>
                <td className="px-4 py-3"><StatusBadge active={u.active} /></td>
                <td className="px-4 py-3 text-right"><ToggleBtn active={u.active} onClick={() => toggleUser(u.id, !u.active)} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'clientes' && (
        <TabSection>
          <Table
            headers={['Nome', 'Documento', 'E-mail', 'Telefone', 'Protheus', 'Status']}
            empty={customers.length === 0}
            emptyTitle="Nenhum cliente sincronizado"
            emptyDesc="Sincronize clientes via Protheus na aba Protheus."
          >
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{c.document ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{c.protheusCode ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge active={c.active} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'produtos' && (
        <TabSection>
          <Table
            headers={['Nome', 'Protheus', 'Unidade', 'Preço', 'Estoque', 'Status']}
            empty={products.length === 0}
            emptyTitle="Nenhum produto sincronizado"
            emptyDesc="Use o botão Sincronizar Produtos na aba Protheus."
          >
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{p.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{p.protheusCode ?? '—'}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{p.unit}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">R$ {Number(p.price).toFixed(2)}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{Number(p.stock).toFixed(3)}</td>
                <td className="px-4 py-3"><StatusBadge active={p.active} /></td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'pedidos' && (
        <TabSection>
          <Table
            headers={['#', 'Cliente', 'Vendedor', 'Filial', 'Itens', 'Total', 'Status', 'Data']}
            empty={orders.length === 0}
            emptyTitle="Nenhum pedido ainda"
            emptyDesc="Os pedidos criados pelos vendedores aparecerão aqui."
          >
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{o.customer.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{o.user.name}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{o.branch.name}</td>
                <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{o.items.length}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">R$ {Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </Table>
        </TabSection>
      )}

      {tab === 'protheus' && (
        <div className="space-y-4">
          {/* Config APIs */}
          <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] p-6">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)] mb-4">Configuração das APIs Protheus</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <ApiConfigRow label="Token (auth)"            value={company.apiToken} />
              <ApiConfigRow label="Produtos (GET)"          value={company.apiPord} />
              <ApiConfigRow label="Clientes (GET)"          value={company.apiCliente} />
              <ApiConfigRow label="Pedido (POST)"           value={company.apiPedido} />
              <ApiConfigRow label="Consulta pedido (GET)"   value={company.apiConsPed} />
              <ApiConfigRow label="Transportadoras (GET)"   value={company.apiTransp} />
              <ApiConfigRow label="Cond. pagamento (GET)"   value={company.apiCondPag} />
              <ApiConfigRow label="Meta vendedor (GET)"     value={company.apiMetaVend} />
              <ApiConfigRow label="Usuário Protheus"        value={company.usrProtheus} />
              <ApiConfigRow label="Senha Protheus"          value={company.passProtheus ? '••••••••' : null} />
            </div>
          </div>

          {/* Sync Produtos */}
          <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Sincronizar Produtos</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Importa produtos via <code className="bg-[var(--bg-subtle)] px-1 rounded text-[var(--text-secondary)]">apiPord</code> e atualiza o catálogo da empresa.
                </p>
              </div>
              <button
                onClick={syncProducts}
                disabled={syncingProducts || !company.apiPord || !company.apiToken}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncingProducts ? 'Sincronizando...' : 'Sincronizar Produtos'}
              </button>
            </div>

            {(!company.apiPord || !company.apiToken) && (
              <div className="mt-3 flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                Configure <strong className="mx-0.5">apiToken</strong> e <strong className="mx-0.5">apiPord</strong> para habilitar a sincronização.
              </div>
            )}

            {syncResult && (
              <div className="mt-4 flex items-start gap-2 p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    {syncResult.synced} de {syncResult.total} produtos sincronizados.
                  </p>
                  {syncResult.errors.length > 0 && (
                    <ul className="mt-1.5 text-xs text-red-500 space-y-1 list-disc list-inside">
                      {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {syncError && (
              <div className="mt-4 flex items-start gap-2 p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-red-500">{syncError}</p>
              </div>
            )}
          </div>
        </div>
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

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-skeleton-pulse">
      <div className="h-6 w-48 bg-[var(--bg-subtle)] rounded" />
      <div className="h-8 w-64 bg-[var(--bg-subtle)] rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-5 py-4 space-y-2">
            <div className="h-3 w-16 bg-[var(--bg-subtle)] rounded" />
            <div className="h-7 w-10 bg-[var(--bg-subtle)] rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, text }: { label: string; value: string | number; text?: boolean }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] px-5 py-4">
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      <p className={`mt-1 font-bold text-[var(--text-primary)] ${text ? 'text-lg' : 'text-3xl tracking-tighter'}`}>{value}</p>
    </div>
  )
}

function TabSection({ children, action }: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div>
      {action && (
        <div className="flex justify-end mb-3">
          <button
            onClick={action.onClick}
            className="text-sm font-medium text-brand-600 hover:text-brand-500 transition-colors"
          >
            {action.label}
          </button>
        </div>
      )}
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function Table({
  headers, empty, emptyTitle, emptyDesc, children,
}: {
  headers: string[]; empty: boolean; emptyTitle: string; emptyDesc: string; children: React.ReactNode
}) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
        <svg className="w-9 h-9 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
        <p className="font-semibold text-[var(--text-primary)] text-sm">{emptyTitle}</p>
        <p className="text-xs text-[var(--text-muted)] max-w-xs">{emptyDesc}</p>
      </div>
    )
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)]">
        <tr>{headers.map((h) => (
          <th key={h} className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">{h}</th>
        ))}</tr>
      </thead>
      <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
    </table>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-500/10 text-green-500' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
    }`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING:   'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    SYNCED:    'bg-green-500/10 text-green-600 dark:text-green-400',
    CANCELLED: 'bg-red-500/10 text-red-500',
  }
  const labels: Record<string, string> = {
    PENDING: 'Pendente', SYNCED: 'Sincronizado', CANCELLED: 'Cancelado',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function ToggleBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${
        active
          ? 'border-red-500/20 text-red-500 hover:bg-red-500/10'
          : 'border-green-500/20 text-green-500 hover:bg-green-500/10'
      }`}
    >
      {active ? 'Desativar' : 'Ativar'}
    </button>
  )
}

function ApiConfigRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className={`text-sm truncate font-mono ${value ? 'text-[var(--text-secondary)]' : 'text-[var(--border)]'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
