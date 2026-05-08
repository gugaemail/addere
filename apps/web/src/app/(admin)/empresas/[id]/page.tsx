'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { CreateBranchModal } from './CreateBranchModal'
import { CreateUserModal } from './CreateUserModal'
import {
  BranchModal, UserModal, CustomerModal, ProductModal,
  ActionMenu,
} from './EntityModals'
import { ProtheusConfigForm } from './ProtheusConfigForm'
import { ConfirmModal } from './ConfirmModal'
import { FIELD_REGISTRY } from '@addere/types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string; name: string; cnpj: string | null; idProtheus: string | null; active: boolean
}
interface User {
  id: string; name: string; email: string; role: 'ADMIN' | 'SALESPERSON'; active: boolean
}
interface Customer {
  id: string; name: string; document: string | null; email: string | null; phone: string | null
  protheusCode: string | null; loja: string | null; address: string | null
  municipio: string | null; bairro: string | null; cep: string | null; uf: string | null
  vendorCode: string | null; msblql: string | null; transpPadrao: string | null
  condPagPadrao: string | null; tes: string | null; xcodemp: string | null
  active: boolean; createdAt: string
}
interface Product {
  id: string; name: string; protheusCode: string | null; price: string; unit: string
  stock: string; saldo: string; description: string | null; active: boolean
}
interface OrderItem {
  id: string; quantity: string; unitPrice: string; discount: string; total: string
  product: { id: string; name: string; unit: string }
}
interface Order {
  id: string; status: string; total: string; notes: string | null; createdAt: string
  protheusOrderId: string | null; syncedAt: string | null
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
interface SyncResult { synced: number; total: number; errors: string[] }

type Tab = 'filiais' | 'usuarios' | 'clientes' | 'produtos' | 'pedidos' | 'protheus' | 'campos'
type ModalState<T> = { mode: 'create' | 'edit' | 'copy' | 'view'; item?: T } | null
type SortConfig = { col: string; dir: 'asc' | 'desc' } | null

// ─── Utilitários de tabela ────────────────────────────────────────────────────

const PAGE_SIZE = 15

function applyTable<T>(
  items: T[],
  filter: (item: T) => boolean,
  sort: SortConfig,
  getField: (item: T, col: string) => string,
  page: number,
): { rows: T[]; total: number; pages: number } {
  let filtered = items.filter(filter)
  if (sort) {
    filtered = [...filtered].sort((a, b) => {
      const av = getField(a, sort.col)
      const bv = getField(b, sort.col)
      return sort.dir === 'asc'
        ? av.localeCompare(bv, 'pt-BR', { sensitivity: 'base' })
        : bv.localeCompare(av, 'pt-BR', { sensitivity: 'base' })
    })
  }
  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), pages)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  return { rows, total, pages }
}

function toggleSort(current: SortConfig, col: string): SortConfig {
  if (current?.col !== col) return { col, dir: 'asc' }
  if (current.dir === 'asc') return { col, dir: 'desc' }
  return null
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function EmpresaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [company,  setCompany]  = useState<CompanyDetail | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>('filiais')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [orders,    setOrders]    = useState<Order[]>([])
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [hiddenFields,   setHiddenFields]   = useState<string[]>([])
  const [savingFields,   setSavingFields]   = useState(false)
  const [fieldsSaved,    setFieldsSaved]    = useState(false)

  // Modais legados (criar)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [showUserModal,   setShowUserModal]   = useState(false)

  // Modais de entidade (editar/copiar/criar)
  const [branchModal,   setBranchModal]   = useState<ModalState<Branch>>(null)
  const [userModal,     setUserModal]     = useState<ModalState<User>>(null)
  const [customerModal, setCustomerModal] = useState<ModalState<Customer>>(null)
  const [productModal,  setProductModal]  = useState<ModalState<Product>>(null)

  // Sync
  const [syncingProducts,       setSyncingProducts]       = useState(false)
  const [syncingCustomers,      setSyncingCustomers]      = useState(false)
  const [syncingTransportadoras, setSyncingTransportadoras] = useState(false)
  const [syncingCondPags,       setSyncingCondPags]       = useState(false)
  const [syncResult,  setSyncResult]  = useState<{ entity: string; result: SyncResult } | null>(null)
  const [syncError,   setSyncError]   = useState<{ entity: string; msg: string } | null>(null)

  // Sync Schedule
  const [schedule, setSchedule] = useState({
    products:  { interv: 0, scheduleMin: 0, auto: false },
    customers: { interv: 0, scheduleMin: 0, auto: false },
  })
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSaved,  setScheduleSaved]  = useState(false)

  // Modal de diagnóstico (compartilhado entre Testar Token e Testar Produtos)
  const [confirmCancel,   setConfirmCancel]   = useState<string | null>(null)
  const [testingToken,     setTestingToken]     = useState(false)
  const [testingProducts,  setTestingProducts]  = useState(false)
  const [testingCustomers, setTestingCustomers] = useState(false)
  const [rawModalTitle,    setRawModalTitle]    = useState('')
  const [tokenTestResult, setTokenTestResult] = useState<unknown>(null)
  const [showTokenModal,  setShowTokenModal]  = useState(false)

  // Busca por aba
  const [searchBranches,  setSearchBranches]  = useState('')
  const [searchUsers,     setSearchUsers]     = useState('')
  const [searchCustomers, setSearchCustomers] = useState('')
  const [searchProducts,  setSearchProducts]  = useState('')
  const [searchOrders,    setSearchOrders]    = useState('')

  // Página atual por aba
  const [pageBranches,  setPageBranches]  = useState(1)
  const [pageUsers,     setPageUsers]     = useState(1)
  const [pageCustomers, setPageCustomers] = useState(1)
  const [pageProducts,  setPageProducts]  = useState(1)
  const [pageOrders,    setPageOrders]    = useState(1)

  // Ordenação por aba
  const [sortBranches,  setSortBranches]  = useState<SortConfig>(null)
  const [sortUsers,     setSortUsers]     = useState<SortConfig>(null)
  const [sortCustomers, setSortCustomers] = useState<SortConfig>(null)
  const [sortProducts,  setSortProducts]  = useState<SortConfig>(null)
  const [sortOrders,    setSortOrders]    = useState<SortConfig>(null)

  async function fetchCompany() {
    const { data } = await api.get<CompanyDetail>(`/companies/${id}`)
    setCompany(data)
    setLoading(false)
  }
  async function fetchFieldConfig() {
    try {
      const { data } = await api.get<{ hidden: string[] }>(`/companies/${id}/field-config`)
      setHiddenFields(data.hidden ?? [])
    } catch { /* ignora */ }
  }
  async function saveFieldConfig() {
    setSavingFields(true)
    await api.patch(`/companies/${id}/field-config`, { hidden: hiddenFields })
    setSavingFields(false)
    setFieldsSaved(true)
    setTimeout(() => setFieldsSaved(false), 3000)
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
  async function fetchSyncSchedule() {
    try {
      const { data } = await api.get(`/companies/${id}/sync-schedule`)
      setSchedule(data)
    } catch { /* ignora */ }
  }
  async function saveSyncSchedule() {
    setSavingSchedule(true)
    try {
      await api.patch(`/companies/${id}/sync-schedule`, schedule)
      setScheduleSaved(true)
      setTimeout(() => setScheduleSaved(false), 3000)
    } finally {
      setSavingSchedule(false)
    }
  }

  useEffect(() => { fetchCompany() }, [id])
  useEffect(() => {
    if (tab === 'clientes') fetchCustomers()
    if (tab === 'produtos') fetchProducts()
    if (tab === 'pedidos')  fetchOrders()
    if (tab === 'campos')   fetchFieldConfig()
    if (tab === 'protheus') fetchSyncSchedule()
  }, [tab])

  // ── Toggles ──────────────────────────────────────────────────────────────

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
  async function toggleCustomer(customerId: string, active: boolean) {
    await api.patch(`/companies/${id}/customers/${customerId}/active`, { active })
    fetchCustomers()
  }
  async function toggleProduct(productId: string, active: boolean) {
    await api.patch(`/companies/${id}/products/${productId}/active`, { active })
    fetchProducts()
  }
  async function cancelOrder(orderId: string) {
    await api.patch(`/companies/${id}/orders/${orderId}/cancel`)
    fetchOrders()
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async function syncProducts() {
    setSyncingProducts(true); setSyncResult(null); setSyncError(null)
    try {
      const { data } = await api.post<SyncResult>('/sync/products', { companyId: id })
      setSyncResult({ entity: 'Produtos', result: data })
      fetchProducts()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao sincronizar'
      setSyncError({ entity: 'produtos', msg })
    } finally { setSyncingProducts(false) }
  }

  async function syncCustomers() {
    setSyncingCustomers(true); setSyncResult(null); setSyncError(null)
    try {
      const { data } = await api.post<SyncResult>('/sync/customers', { companyId: id })
      setSyncResult({ entity: 'Clientes', result: data })
      fetchCustomers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao sincronizar'
      setSyncError({ entity: 'clientes', msg })
    } finally { setSyncingCustomers(false) }
  }

  async function syncTransportadoras() {
    setSyncingTransportadoras(true); setSyncResult(null); setSyncError(null)
    try {
      const { data } = await api.post<SyncResult>('/sync/transportadoras', { companyId: id })
      setSyncResult({ entity: 'Transportadoras', result: data })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao sincronizar'
      setSyncError({ entity: 'transportadoras', msg })
    } finally { setSyncingTransportadoras(false) }
  }

  async function syncCondPags() {
    setSyncingCondPags(true); setSyncResult(null); setSyncError(null)
    try {
      const { data } = await api.post<SyncResult>('/sync/cond-pags', { companyId: id })
      setSyncResult({ entity: 'Condições de pagamento', result: data })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao sincronizar'
      setSyncError({ entity: 'condições de pagamento', msg })
    } finally { setSyncingCondPags(false) }
  }

  async function testToken() {
    setTestingToken(true)
    setTokenTestResult(null)
    setRawModalTitle('Testar Token')
    try {
      const { data } = await api.post('/sync/test-token', { companyId: id })
      setTokenTestResult(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message: string }
      setTokenTestResult(e.response?.data ?? { error: e.message })
    } finally {
      setTestingToken(false)
      setShowTokenModal(true)
    }
  }

  async function testProducts() {
    setTestingProducts(true)
    setTokenTestResult(null)
    setRawModalTitle('Testar Produtos')
    try {
      const { data } = await api.post('/sync/test-products', { companyId: id })
      setTokenTestResult(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message: string }
      setTokenTestResult(e.response?.data ?? { error: e.message })
    } finally {
      setTestingProducts(false)
      setShowTokenModal(true)
    }
  }

  async function testCustomers() {
    setTestingCustomers(true)
    setTokenTestResult(null)
    setRawModalTitle('Testar Clientes')
    try {
      const { data } = await api.post('/sync/test-customers', { companyId: id })
      setTokenTestResult(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message: string }
      setTokenTestResult(e.response?.data ?? { error: e.message })
    } finally {
      setTestingCustomers(false)
      setShowTokenModal(true)
    }
  }

  if (loading) return <PageSkeleton />
  if (!company) return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <p className="font-semibold text-[var(--text-primary)]">Empresa não encontrada</p>
    </div>
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'filiais',  label: `Filiais (${company.branches.length})` },
    { key: 'usuarios', label: `Usuários (${company.users.length})` },
    { key: 'clientes', label: 'Clientes' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'pedidos',  label: 'Pedidos' },
    { key: 'protheus', label: 'Protheus' },
    { key: 'campos',   label: 'Campos' },
  ]

  // ── Dados filtrados / ordenados / paginados ───────────────────────────────

  const qBr = searchBranches.toLowerCase()
  const branchTable = applyTable(
    company.branches,
    (b) => !qBr || b.name.toLowerCase().includes(qBr) || (b.cnpj ?? '').toLowerCase().includes(qBr) || (b.idProtheus ?? '').toLowerCase().includes(qBr),
    sortBranches,
    (b, col) => col === 'name' ? b.name : (b.idProtheus ?? ''),
    pageBranches,
  )

  const qUs = searchUsers.toLowerCase()
  const userTable = applyTable(
    company.users,
    (u) => !qUs || u.name.toLowerCase().includes(qUs) || u.email.toLowerCase().includes(qUs),
    sortUsers,
    (u, col) => col === 'name' ? u.name : u.email,
    pageUsers,
  )

  const qCu = searchCustomers.toLowerCase()
  const customerTable = applyTable(
    customers,
    (c) => !qCu || c.name.toLowerCase().includes(qCu) || (c.document ?? '').toLowerCase().includes(qCu) || (c.email ?? '').toLowerCase().includes(qCu) || (c.protheusCode ?? '').toLowerCase().includes(qCu),
    sortCustomers,
    (c, col) => col === 'name' ? c.name : (c.protheusCode ?? ''),
    pageCustomers,
  )

  const qPr = searchProducts.toLowerCase()
  const productTable = applyTable(
    products,
    (p) => !qPr || p.name.toLowerCase().includes(qPr) || (p.protheusCode ?? '').toLowerCase().includes(qPr),
    sortProducts,
    (p, col) => col === 'name' ? p.name : (p.protheusCode ?? ''),
    pageProducts,
  )

  const qOr = searchOrders.toLowerCase()
  const orderTable = applyTable(
    orders,
    (o) => !qOr || o.id.slice(0, 8).toLowerCase().includes(qOr) || o.customer.name.toLowerCase().includes(qOr) || o.user.name.toLowerCase().includes(qOr) || o.status.toLowerCase().includes(qOr),
    sortOrders,
    (o, col) => {
      if (col === 'id') return o.id
      if (col === 'customer') return o.customer.name
      if (col === 'date') return o.createdAt
      return ''
    },
    pageOrders,
  )

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

      {/* ── Tab: Filiais ── */}
      {tab === 'filiais' && (
        <TabSection
          action={{ label: '+ Nova filial', onClick: () => setShowBranchModal(true) }}
          search={<SearchInput value={searchBranches} onChange={(v) => { setSearchBranches(v); setPageBranches(1) }} placeholder="Pesquisar filiais…" />}
          footer={<Pagination page={pageBranches} total={branchTable.total} pages={branchTable.pages} onPage={setPageBranches} />}
        >
          <div className="overflow-auto max-h-[520px]">
            <Table
              customHeaders={
                <tr>
                  <SortableHeader label="Nome" col="name" sort={sortBranches} onSort={(c) => { setSortBranches(toggleSort(sortBranches, c)); setPageBranches(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">CNPJ</th>
                  <SortableHeader label="Protheus" col="code" sort={sortBranches} onSort={(c) => { setSortBranches(toggleSort(sortBranches, c)); setPageBranches(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              }
              empty={company.branches.length === 0}
              emptyTitle="Nenhuma filial"
              emptyDesc="Adicione a primeira filial desta empresa."
              noResults={branchTable.total === 0 && !!searchBranches}
            >
              {branchTable.rows.map((b) => (
                <tr key={b.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{b.name}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{b.cnpj ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{b.idProtheus ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge active={b.active} /></td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      label="filial"
                      active={b.active}
                      onEdit={() => setBranchModal({ mode: 'edit', item: b })}
                      onCopy={() => setBranchModal({ mode: 'copy', item: b })}
                      onToggle={() => toggleBranch(b.id, !b.active)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </TabSection>
      )}

      {/* ── Tab: Usuários ── */}
      {tab === 'usuarios' && (
        <TabSection
          action={{ label: '+ Novo usuário', onClick: () => setShowUserModal(true) }}
          search={<SearchInput value={searchUsers} onChange={(v) => { setSearchUsers(v); setPageUsers(1) }} placeholder="Pesquisar usuários…" />}
          footer={<Pagination page={pageUsers} total={userTable.total} pages={userTable.pages} onPage={setPageUsers} />}
        >
          <div className="overflow-auto max-h-[520px]">
            <Table
              customHeaders={
                <tr>
                  <SortableHeader label="Nome" col="name" sort={sortUsers} onSort={(c) => { setSortUsers(toggleSort(sortUsers, c)); setPageUsers(1) }} />
                  <SortableHeader label="E-mail" col="email" sort={sortUsers} onSort={(c) => { setSortUsers(toggleSort(sortUsers, c)); setPageUsers(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Perfil</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              }
              empty={company.users.length === 0}
              emptyTitle="Nenhum usuário"
              emptyDesc="Adicione o primeiro usuário desta empresa."
              noResults={userTable.total === 0 && !!searchUsers}
            >
              {userTable.rows.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{u.name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{u.role === 'ADMIN' ? 'Administrador' : 'Vendedor'}</td>
                  <td className="px-4 py-3"><StatusBadge active={u.active} /></td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      label="usuário"
                      active={u.active}
                      onEdit={() => setUserModal({ mode: 'edit', item: u })}
                      onCopy={() => setUserModal({ mode: 'copy', item: u })}
                      onToggle={() => toggleUser(u.id, !u.active)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </TabSection>
      )}

      {/* ── Tab: Clientes ── */}
      {tab === 'clientes' && (
        <TabSection
          action={{ label: '+ Novo cliente', onClick: () => setCustomerModal({ mode: 'create' }) }}
          search={<SearchInput value={searchCustomers} onChange={(v) => { setSearchCustomers(v); setPageCustomers(1) }} placeholder="Pesquisar clientes…" />}
          footer={<Pagination page={pageCustomers} total={customerTable.total} pages={customerTable.pages} onPage={setPageCustomers} />}
        >
          <div className="overflow-auto max-h-[520px]">
            <Table
              customHeaders={
                <tr>
                  <SortableHeader label="Nome" col="name" sort={sortCustomers} onSort={(c) => { setSortCustomers(toggleSort(sortCustomers, c)); setPageCustomers(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Documento</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">E-mail</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Telefone</th>
                  <SortableHeader label="Protheus" col="code" sort={sortCustomers} onSort={(c) => { setSortCustomers(toggleSort(sortCustomers, c)); setPageCustomers(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              }
              empty={customers.length === 0}
              emptyTitle="Nenhum cliente"
              emptyDesc="Adicione manualmente ou sincronize via Protheus."
              noResults={customerTable.total === 0 && !!searchCustomers}
            >
              {customerTable.rows.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.name}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{c.document ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{c.protheusCode ? `${c.protheusCode}${c.loja ? `/${c.loja}` : ''}` : '—'}</td>
                  <td className="px-4 py-3"><StatusBadge active={c.active} /></td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      label="cliente"
                      active={c.active}
                      onView={() => setCustomerModal({ mode: 'view', item: c })}
                      onEdit={() => setCustomerModal({ mode: 'edit', item: c })}
                      onCopy={() => setCustomerModal({ mode: 'copy', item: c })}
                      onToggle={() => toggleCustomer(c.id, !c.active)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </TabSection>
      )}

      {/* ── Tab: Produtos ── */}
      {tab === 'produtos' && (
        <TabSection
          action={{ label: '+ Novo produto', onClick: () => setProductModal({ mode: 'create' }) }}
          search={<SearchInput value={searchProducts} onChange={(v) => { setSearchProducts(v); setPageProducts(1) }} placeholder="Pesquisar produtos…" />}
          footer={<Pagination page={pageProducts} total={productTable.total} pages={productTable.pages} onPage={setPageProducts} />}
        >
          <div className="overflow-auto max-h-[520px]">
            <Table
              customHeaders={
                <tr>
                  <SortableHeader label="Nome" col="name" sort={sortProducts} onSort={(c) => { setSortProducts(toggleSort(sortProducts, c)); setPageProducts(1) }} />
                  <SortableHeader label="Protheus" col="code" sort={sortProducts} onSort={(c) => { setSortProducts(toggleSort(sortProducts, c)); setPageProducts(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Unidade</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Preço</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Estoque</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              }
              empty={products.length === 0}
              emptyTitle="Nenhum produto"
              emptyDesc="Adicione manualmente ou sincronize via Protheus."
              noResults={productTable.total === 0 && !!searchProducts}
            >
              {productTable.rows.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--bg-subtle)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{p.name}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{p.protheusCode ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{p.unit}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">R$ {Number(p.price).toFixed(2)}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{Number(p.stock).toFixed(3)}</td>
                  <td className="px-4 py-3"><StatusBadge active={p.active} /></td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      label="produto"
                      active={p.active}
                      onView={() => setProductModal({ mode: 'view', item: p })}
                      onEdit={() => setProductModal({ mode: 'edit', item: p })}
                      onCopy={() => setProductModal({ mode: 'copy', item: p })}
                      onToggle={() => toggleProduct(p.id, !p.active)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </TabSection>
      )}

      {/* ── Tab: Pedidos ── */}
      {tab === 'pedidos' && (
        <TabSection
          search={<SearchInput value={searchOrders} onChange={(v) => { setSearchOrders(v); setPageOrders(1) }} placeholder="Pesquisar pedidos…" />}
          footer={<Pagination page={pageOrders} total={orderTable.total} pages={orderTable.pages} onPage={setPageOrders} />}
        >
          <div className="overflow-auto max-h-[520px]">
            <Table
              customHeaders={
                <tr>
                  <SortableHeader label="#" col="id" sort={sortOrders} onSort={(c) => { setSortOrders(toggleSort(sortOrders, c)); setPageOrders(1) }} />
                  <SortableHeader label="Cliente" col="customer" sort={sortOrders} onSort={(c) => { setSortOrders(toggleSort(sortOrders, c)); setPageOrders(1) }} />
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Vendedor</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Filial</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Itens</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">Status</th>
                  <SortableHeader label="Data" col="date" sort={sortOrders} onSort={(c) => { setSortOrders(toggleSort(sortOrders, c)); setPageOrders(1) }} />
                  <th className="px-4 py-3" />
                </tr>
              }
              empty={orders.length === 0}
              emptyTitle="Nenhum pedido ainda"
              emptyDesc="Os pedidos criados pelos vendedores aparecerão aqui."
              noResults={orderTable.total === 0 && !!searchOrders}
            >
              {orderTable.rows.map((o) => (
                <>
                  <tr
                    key={o.id}
                    className="hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                  >
                    <td className="px-4 py-3 text-[var(--text-muted)] font-mono text-xs">{o.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{o.customer.name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{o.user.name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{o.branch.name}</td>
                    <td className="px-4 py-3 text-center text-[var(--text-secondary)]">{o.items.length}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">R$ {Number(o.total).toFixed(2)}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">
                      {o.status !== 'CANCELLED' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmCancel(o.id) }}
                          className="text-xs font-medium px-3 py-1 rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedOrder === o.id && (
                    <tr key={`${o.id}-detail`}>
                      <td colSpan={9} className="px-4 pb-4 bg-[var(--bg-subtle)]">
                        <div className="rounded-lg border border-[var(--border)] overflow-hidden mt-1">
                          <table className="w-full text-xs">
                            <thead className="bg-[var(--bg-surface)]">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-[var(--text-secondary)]">Produto</th>
                                <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Qtd</th>
                                <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Preço unit.</th>
                                <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Desc. %</th>
                                <th className="text-right px-3 py-2 font-medium text-[var(--text-secondary)]">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {o.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-2 text-[var(--text-primary)]">{item.product.name}</td>
                                  <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{Number(item.quantity).toFixed(3)} {item.product.unit}</td>
                                  <td className="px-3 py-2 text-right text-[var(--text-secondary)]">R$ {Number(item.unitPrice).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-[var(--text-secondary)]">{Number(item.discount).toFixed(1)}%</td>
                                  <td className="px-3 py-2 text-right font-medium text-[var(--text-primary)]">R$ {Number(item.total).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {(o.protheusOrderId || o.notes) && (
                            <div className="px-3 py-2 bg-[var(--bg-surface)] border-t border-[var(--border)] flex gap-6 text-xs text-[var(--text-muted)]">
                              {o.protheusOrderId && <span>Pedido Protheus: <span className="font-mono">{o.protheusOrderId}</span></span>}
                              {o.notes && <span>Obs: {o.notes}</span>}
                              {o.syncedAt && <span>Sincronizado: {new Date(o.syncedAt).toLocaleString('pt-BR')}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </Table>
          </div>
        </TabSection>
      )}

      {/* ── Tab: Protheus ── */}
      {tab === 'protheus' && (() => {
        const hasActiveBranch = company.branches.some((b) => b.active && b.idProtheus)
        const missingProd = !company.apiPord || !company.apiToken
          ? 'Configure apiToken e apiPord para habilitar.'
          : !hasActiveBranch ? 'Nenhuma filial ativa com Código Protheus configurado (aba Filiais).' : undefined
        const spinnerSvg = (
          <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )
        const warnSvg = (
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        )
        const cardHeader = (title: string, subtitle?: string) => (
          <div className="px-4 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
          </div>
        )
        const scheduleSection = (entity: 'products' | 'customers') => {
          const s = schedule[entity]
          return (
            <div className="border-t border-[var(--border)] pt-4 mt-4 space-y-3">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Sincronização Automática</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">INTERV (min)</label>
                  <input type="number" min={0} value={s.interv}
                    onChange={(e) => setSchedule((prev) => ({ ...prev, [entity]: { ...prev[entity], interv: Number(e.target.value) } }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-xs text-[var(--text-muted)] mt-1">0 = busca todos</p>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Intervalo auto-sync (min)</label>
                  <input type="number" min={0} value={s.scheduleMin} disabled={!s.auto}
                    onChange={(e) => setSchedule((prev) => ({ ...prev, [entity]: { ...prev[entity], scheduleMin: Number(e.target.value) } }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40" />
                  <p className="text-xs text-[var(--text-muted)] mt-1">0 = desabilitado</p>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={s.auto}
                  onChange={(e) => setSchedule((prev) => ({ ...prev, [entity]: { ...prev[entity], auto: e.target.checked } }))}
                  className="w-4 h-4 accent-brand-500 cursor-pointer" />
                <span className="text-sm text-[var(--text-primary)]">
                  Auto-sync {s.auto
                    ? <span className="text-green-500 font-medium">Ativo{s.scheduleMin > 0 ? ` — a cada ${s.scheduleMin} min` : ''}</span>
                    : <span className="text-[var(--text-muted)]">Inativo</span>}
                </span>
              </label>
            </div>
          )
        }
        return (
          <div className="space-y-4">
            <ProtheusConfigForm
              company={company}
              onSaved={(updated) => { setCompany((prev) => prev ? { ...prev, ...updated } : prev); fetchCompany() }}
            />

            {syncResult && (
              <div className="flex items-start gap-2 p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-green-600">{syncResult.entity}: {syncResult.result.synced} de {syncResult.result.total} sincronizados.</p>
                  {syncResult.result.errors.length > 0 && (
                    <ul className="mt-1.5 text-xs text-red-500 space-y-1 list-disc list-inside">
                      {syncResult.result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {syncError && (
              <div className="flex items-start gap-2 p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-sm text-red-500">{syncError.msg}</p>
              </div>
            )}

            {/* ── Autenticação ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              {cardHeader('Autenticação', 'Valide a conexão com o Protheus antes de sincronizar.')}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Testar autenticação Protheus</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">Chama o endpoint <code className="bg-[var(--bg-subtle)] px-1 rounded">apiToken</code> e exibe a resposta bruta para diagnóstico.</p>
                </div>
                <button onClick={testToken} disabled={testingToken || !company.apiToken || !company.usrProtheus || !company.passProtheus}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                  {testingToken && spinnerSvg}{testingToken ? 'Testando…' : 'Testar Token'}
                </button>
              </div>
            </div>

            {/* ── Produtos ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              {cardHeader('Produtos')}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Testar API</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Busca página 1 via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiPord</code> — sem salvar no banco.</p>
                    </div>
                    <button onClick={testProducts} disabled={testingProducts || !company.apiPord || !company.apiToken || !company.usrProtheus || !company.passProtheus}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                      {testingProducts && spinnerSvg}{testingProducts ? 'Testando…' : 'Testar API'}
                    </button>
                  </div>
                  <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Sincronizar</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiPord</code> e atualiza o catálogo.</p>
                      {missingProd && <p className="flex items-start gap-1 mt-1.5 text-xs text-yellow-600">{warnSvg}{missingProd}</p>}
                    </div>
                    <button onClick={syncProducts} disabled={syncingProducts || !!missingProd}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                      {syncingProducts && spinnerSvg}{syncingProducts ? 'Sincronizando…' : 'Sincronizar Produtos'}
                    </button>
                  </div>
                </div>
                {scheduleSection('products')}
              </div>
            </div>

            {/* ── Clientes ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              {cardHeader('Clientes')}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Testar API</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Busca página 1 via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCliente</code> — sem salvar no banco.</p>
                    </div>
                    <button onClick={testCustomers} disabled={testingCustomers || !company.apiCliente || !company.apiToken || !company.usrProtheus || !company.passProtheus}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                      {testingCustomers && spinnerSvg}{testingCustomers ? 'Testando…' : 'Testar API'}
                    </button>
                  </div>
                  <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Sincronizar</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCliente</code> e atualiza a base.</p>
                      {(!company.apiCliente || !company.apiToken) && <p className="flex items-start gap-1 mt-1.5 text-xs text-yellow-600">{warnSvg}Configure apiToken e apiCliente para habilitar.</p>}
                    </div>
                    <button onClick={syncCustomers} disabled={syncingCustomers || !company.apiCliente || !company.apiToken}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                      {syncingCustomers && spinnerSvg}{syncingCustomers ? 'Sincronizando…' : 'Sincronizar Clientes'}
                    </button>
                  </div>
                </div>
                {scheduleSection('customers')}
              </div>
            </div>

            {/* ── Transportadoras ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              {cardHeader('Transportadoras')}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiTransp</code> e atualiza a lista disponível nos pedidos.</p>
                  {(!company.apiTransp || !company.apiToken) && <p className="flex items-center gap-1 mt-1.5 text-xs text-yellow-600">{warnSvg}Configure apiToken e apiTransp para habilitar.</p>}
                </div>
                <button onClick={syncTransportadoras} disabled={syncingTransportadoras || !company.apiTransp || !company.apiToken}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                  {syncingTransportadoras && spinnerSvg}{syncingTransportadoras ? 'Sincronizando…' : 'Sincronizar Transportadoras'}
                </button>
              </div>
            </div>

            {/* ── Condições de Pagamento ── */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
              {cardHeader('Condições de Pagamento')}
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCondPag</code> e atualiza as opções disponíveis nos pedidos.</p>
                  {(!company.apiCondPag || !company.apiToken) && <p className="flex items-center gap-1 mt-1.5 text-xs text-yellow-600">{warnSvg}Configure apiToken e apiCondPag para habilitar.</p>}
                </div>
                <button onClick={syncCondPags} disabled={syncingCondPags || !company.apiCondPag || !company.apiToken}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                  {syncingCondPags && spinnerSvg}{syncingCondPags ? 'Sincronizando…' : 'Sincronizar Cond. Pagamento'}
                </button>
              </div>
            </div>

            {/* ── Salvar auto-sync ── */}
            <div className="flex items-center gap-4 pt-1">
              <button onClick={saveSyncSchedule} disabled={savingSchedule}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
                {savingSchedule ? 'Salvando…' : 'Salvar configuração auto-sync'}
              </button>
              {scheduleSaved && <span className="text-sm text-green-600 font-medium">Configuração salva!</span>}
            </div>
          </div>
        )
      })()}

      {/* ── Modais legados (criar) ── */}
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

      {/* ── Modais de entidade ── */}
      {branchModal && (
        <BranchModal
          companyId={id}
          mode={branchModal.mode}
          branch={branchModal.item}
          onClose={() => setBranchModal(null)}
          onSaved={() => { setBranchModal(null); fetchCompany() }}
        />
      )}
      {userModal && (
        <UserModal
          companyId={id}
          mode={userModal.mode}
          user={userModal.item}
          onClose={() => setUserModal(null)}
          onSaved={() => { setUserModal(null); fetchCompany() }}
        />
      )}
      {customerModal && (
        <CustomerModal
          companyId={id}
          mode={customerModal.mode}
          customer={customerModal.item}
          onClose={() => setCustomerModal(null)}
          onSaved={() => { setCustomerModal(null); fetchCustomers() }}
        />
      )}
      {productModal && (
        <ProductModal
          companyId={id}
          mode={productModal.mode}
          product={productModal.item}
          onClose={() => setProductModal(null)}
          onSaved={() => { setProductModal(null); fetchProducts() }}
        />
      )}

      {/* ── Modal de confirmação de cancelamento ── */}
      {confirmCancel && (
        <ConfirmModal
          title="Cancelar pedido?"
          description={`O pedido #${confirmCancel.slice(0, 8)} será cancelado e não poderá ser reaberto.`}
          confirmLabel="Sim, cancelar"
          onConfirm={() => cancelOrder(confirmCancel)}
          onClose={() => setConfirmCancel(null)}
        />
      )}

      {/* ── Modal resultado do teste de token ── */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                {(tokenTestResult as { ok?: boolean })?.ok === false ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    {rawModalTitle} — Falha
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    {rawModalTitle} — Sucesso
                  </span>
                )}
                {(tokenTestResult as { ms?: number })?.ms != null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {(tokenTestResult as { ms: number }).ms} ms
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-auto p-4">
              <pre className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-subtle)] rounded-xl p-4 whitespace-pre-wrap break-all">
                {JSON.stringify(tokenTestResult, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Campos ── */}
      {tab === 'campos' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Visibilidade de campos</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Campos desmarcados ficam ocultos no app mobile para todos os usuários desta empresa.
            </p>
          </div>

          {(['customer', 'order', 'orderItem', 'product'] as const).map((entity) => {
            const entityLabel: Record<string, string> = {
              customer: 'Cliente', order: 'Pedido', orderItem: 'Item do Pedido', product: 'Produto',
            }
            const fields = FIELD_REGISTRY.filter((f) => f.entity === entity)
            return (
              <div key={entity} className="rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-4 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border)]">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{entityLabel[entity]}</h3>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {fields.map((field) => {
                    const isHidden = hiddenFields.includes(field.key)
                    return (
                      <label key={field.key} className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{field.label}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {field.affectsInput ? 'Oculta exibição e formulário' : 'Oculta apenas exibição'}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHiddenFields((prev) => prev.filter((k) => k !== field.key))
                            } else {
                              setHiddenFields((prev) => [...prev, field.key])
                            }
                          }}
                          className="w-4 h-4 accent-brand-500 cursor-pointer"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-4">
            <button
              onClick={saveFieldConfig}
              disabled={savingFields}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {savingFields ? 'Salvando…' : 'Salvar configuração'}
            </button>
            {fieldsSaved && (
              <span className="text-sm text-green-600 font-medium">Configuração salva!</span>
            )}
          </div>
        </div>
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

function TabSection({
  children, action, search, footer,
}: {
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
  search?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div>
      {(action || search) && (
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex-1">{search}</div>
          {action && (
            <button
              onClick={action.onClick}
              className="text-sm font-medium text-brand-600 hover:text-brand-500 transition-colors shrink-0"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] overflow-hidden">
        {children}
        {footer}
      </div>
    </div>
  )
}

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="relative max-w-xs">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.606 10.606Z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Pesquisar…'}
        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors"
      />
    </div>
  )
}

function SortableHeader({ label, col, sort, onSort }: {
  label: string; col: string; sort: SortConfig; onSort: (col: string) => void
}) {
  const active = sort?.col === col
  return (
    <th
      className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-colors ${active ? 'text-brand-500' : 'text-[var(--text-muted)]'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          {!active && <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />}
          {active && sort?.dir === 'asc'  && <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />}
          {active && sort?.dir === 'desc' && <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
        </svg>
      </span>
    </th>
  )
}

function Pagination({ page, total, pages, onPage }: {
  page: number; total: number; pages: number; onPage: (p: number) => void
}) {
  if (pages <= 1 && total <= PAGE_SIZE) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
      <span>{total} registro{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Anterior
        </button>
        <span className="px-1">Página {page} de {pages}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Próximo
        </button>
      </div>
    </div>
  )
}

function Table({
  customHeaders, empty, emptyTitle, emptyDesc, noResults, children,
}: {
  customHeaders?: React.ReactNode
  empty: boolean
  emptyTitle: string
  emptyDesc: string
  noResults?: boolean
  children: React.ReactNode
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
  if (noResults) {
    return (
      <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-2">
        <svg className="w-9 h-9 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.197 5.197a7.5 7.5 0 0 0 10.606 10.606Z" />
        </svg>
        <p className="font-semibold text-[var(--text-primary)] text-sm">Nenhum resultado</p>
        <p className="text-xs text-[var(--text-muted)] max-w-xs">Tente outros termos de busca.</p>
      </div>
    )
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border)] sticky top-0 z-10">
        {customHeaders}
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

function SyncCard({
  title, description, disabled, loading, missingFields, onSync, btnLabel,
}: {
  title: string
  description: React.ReactNode
  disabled: boolean
  loading: boolean
  missingFields?: string
  onSync: () => void
  btnLabel: string
}) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
        </div>
        <button
          onClick={onSync}
          disabled={disabled}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Sincronizando...' : btnLabel}
        </button>
      </div>
      {missingFields && (
        <div className="mt-3 flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {missingFields}
        </div>
      )}
    </div>
  )
}
