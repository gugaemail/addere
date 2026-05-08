'use client'

import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { Modal, Field, ModalActions, ErrorMsg } from './CreateBranchModal'

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface Branch    { id: string; name: string; cnpj: string | null; idProtheus: string | null; active: boolean }
interface User      { id: string; name: string; email: string; role: 'ADMIN' | 'SALESPERSON'; active: boolean; idVendProt: string | null }
interface Customer  {
  id: string; name: string; document: string | null; email: string | null; phone: string | null
  protheusCode: string | null; loja: string | null; address: string | null; municipio: string | null
  bairro: string | null; cep: string | null; uf: string | null; vendorCode: string | null
  msblql: string | null; transpPadrao: string | null; condPagPadrao: string | null
  tes: string | null; xcodemp: string | null; active: boolean
}
interface Product   { id: string; name: string; protheusCode: string | null; price: string; unit: string; stock: string; saldo: string; description: string | null; active: boolean }

type ModalMode = 'create' | 'edit' | 'copy' | 'view'

// ─── Helper campo numérico ─────────────────────────────────────────────────────

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
      />
    </div>
  )
}

// ─── Modal Filial ─────────────────────────────────────────────────────────────

interface BranchModalProps {
  companyId: string
  mode: ModalMode
  branch?: Branch
  onClose: () => void
  onSaved: () => void
}

export function BranchModal({ companyId, mode, branch, onClose, onSaved }: BranchModalProps) {
  const [name,        setName]        = useState(branch?.name        ?? '')
  const [cnpj,        setCnpj]        = useState(branch?.cnpj        ?? '')
  const [idProtheus,  setIdProtheus]  = useState(mode === 'copy' ? '' : (branch?.idProtheus ?? ''))
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  const title = mode === 'create' ? 'Nova Filial' : mode === 'copy' ? 'Copiar Filial' : 'Editar Filial'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = { name, cnpj: cnpj || undefined, idProtheus: idProtheus || undefined }
      if (mode === 'edit' && branch) {
        await api.patch(`/companies/${companyId}/branches/${branch.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/branches`, body)
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar filial.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome" value={name} onChange={setName} required />
        <Field label="CNPJ" value={cnpj} onChange={setCnpj} placeholder="Opcional" />
        <Field label="Código Protheus" value={idProtheus} onChange={setIdProtheus} placeholder="Opcional" />
        <ModalActions loading={loading} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Modal Usuário ────────────────────────────────────────────────────────────

interface UserModalProps {
  companyId: string
  mode: ModalMode
  user?: User
  onClose: () => void
  onSaved: () => void
}

export function UserModal({ companyId, mode, user, onClose, onSaved }: UserModalProps) {
  const [name,       setName]       = useState(user?.name       ?? '')
  const [email,      setEmail]      = useState(mode === 'copy' ? '' : (user?.email ?? ''))
  const [password,   setPassword]   = useState('')
  const [role,       setRole]       = useState<'ADMIN' | 'SALESPERSON'>(user?.role ?? 'SALESPERSON')
  const [idVendProt, setIdVendProt] = useState(user?.idVendProt ?? '')
  const [error,      setError]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)

  const title = mode === 'create' ? 'Novo Usuário' : mode === 'copy' ? 'Copiar Usuário' : 'Editar Usuário'
  const isNew = mode !== 'edit'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'edit' && user) {
        const body: Record<string, unknown> = { name, email, role }
        if (password) body.password = password
        if (role === 'SALESPERSON') body.idVendProt = idVendProt || null
        await api.patch(`/companies/${companyId}/users/${user.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/users`, {
          name, email, password, role,
          ...(role === 'SALESPERSON' && { idVendProt: idVendProt || null }),
        })
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar usuário.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome" value={name} onChange={setName} required />
        <Field label="E-mail" value={email} onChange={setEmail} required />
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Senha {!isNew && <span className="text-[var(--text-muted)] font-normal">(deixe em branco para manter)</span>}
          </label>
          <input
            type="password"
            required={isNew}
            minLength={isNew ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Perfil</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'ADMIN' | 'SALESPERSON')}
            className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
          >
            <option value="SALESPERSON">Vendedor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        {role === 'SALESPERSON' && (
          <Field
            label="Cód. Vendedor (Protheus)"
            value={idVendProt}
            onChange={setIdVendProt}
            placeholder="Código do vendedor no ERP (ex: 001)"
          />
        )}
        <ModalActions loading={loading} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Máscaras ────────────────────────────────────────────────────────────────

function maskDocument(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`
    return d
  }
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length > 8)  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  if (d.length > 5)  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length > 2)  return `${d.slice(0, 2)}.${d.slice(2)}`
  return d
}

function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`
  return d
}

function formatDocumentDisplay(v: string | null): string {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

function formatCEPDisplay(v: string | null): string {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return v
}

// ─── Modal Cliente ────────────────────────────────────────────────────────────

interface CustomerModalProps {
  companyId: string
  mode: ModalMode
  customer?: Customer
  onClose: () => void
  onSaved: () => void
}

function ViewRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-sm text-[var(--text-muted)] shrink-0 mr-4">{label}</span>
      <span className="text-sm text-[var(--text-primary)] text-right break-all">{value || '—'}</span>
    </div>
  )
}

export function CustomerModal({ companyId, mode, customer, onClose, onSaved }: CustomerModalProps) {
  const [name,          setName]          = useState(customer?.name          ?? '')
  const [protheusCode,  setProtheusCode]  = useState(mode === 'copy' ? '' : (customer?.protheusCode  ?? ''))
  const [loja,          setLoja]          = useState(mode === 'copy' ? '' : (customer?.loja          ?? ''))
  const [document,      setDocument]      = useState(customer?.document      ?? '')
  const [email,         setEmail]         = useState(customer?.email         ?? '')
  const [phone,         setPhone]         = useState(customer?.phone         ?? '')
  const [address,       setAddress]       = useState(customer?.address       ?? '')
  const [municipio,     setMunicipio]     = useState(customer?.municipio     ?? '')
  const [bairro,        setBairro]        = useState(customer?.bairro        ?? '')
  const [cep,           setCep]           = useState(customer?.cep           ?? '')
  const [uf,            setUf]            = useState(customer?.uf            ?? '')
  const [vendorCode,    setVendorCode]    = useState(customer?.vendorCode    ?? '')
  const [msblql,        setMsblql]        = useState(customer?.msblql        ?? '2')
  const [transpPadrao,  setTranspPadrao]  = useState(customer?.transpPadrao  ?? '')
  const [condPagPadrao, setCondPagPadrao] = useState(customer?.condPagPadrao ?? '')
  const [tes,           setTes]           = useState(customer?.tes           ?? '')
  const [xcodemp,       setXcodemp]       = useState(customer?.xcodemp       ?? '')
  const [error,         setError]         = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)

  const isView  = mode === 'view'
  const title   = mode === 'create' ? 'Novo Cliente'
                : mode === 'copy'   ? 'Copiar Cliente'
                : mode === 'view'   ? 'Dados do Cliente'
                : 'Editar Cliente'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = {
        name,
        protheusCode:  protheusCode  || undefined,
        loja:          loja          || undefined,
        document:      document.replace(/\D/g, '') || undefined,
        email:         email         || undefined,
        phone:         phone         || undefined,
        address:       address       || undefined,
        municipio:     municipio     || undefined,
        bairro:        bairro        || undefined,
        cep:           cep.replace(/\D/g, '') || undefined,
        uf:            uf            || undefined,
        vendorCode:    vendorCode    || undefined,
        msblql:        msblql        || undefined,
        transpPadrao:  transpPadrao  || undefined,
        condPagPadrao: condPagPadrao || undefined,
        tes:           tes           || undefined,
        xcodemp:       xcodemp       || undefined,
      }
      if (mode === 'edit' && customer) {
        await api.patch(`/companies/${companyId}/customers/${customer.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/customers`, body)
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar cliente.')
    } finally {
      setLoading(false)
    }
  }

  if (isView && customer) {
    return (
      <Modal title={title} onClose={onClose} wide>
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-1">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Identificação</p>
          <ViewRow label="Nome"              value={customer.name} />
          <ViewRow label="CPF / CNPJ"        value={formatDocumentDisplay(customer.document)} />
          <ViewRow label="Cod. Protheus"      value={customer.protheusCode} />
          <ViewRow label="Loja"               value={customer.loja} />
          <ViewRow label="Cód. Vendedor"      value={customer.vendorCode} />
          <ViewRow label="Status Protheus"    value={customer.msblql === '1' ? 'Bloqueado' : customer.msblql === '2' ? 'Liberado' : undefined} />

          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mt-4 mb-2">Contato</p>
          <ViewRow label="E-mail"    value={customer.email} />
          <ViewRow label="Telefone"  value={customer.phone} />

          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mt-4 mb-2">Endereço</p>
          <ViewRow label="Endereço"   value={customer.address} />
          <ViewRow label="Bairro"     value={customer.bairro} />
          <ViewRow label="Município"  value={customer.municipio} />
          <ViewRow label="UF"         value={customer.uf} />
          <ViewRow label="CEP"        value={formatCEPDisplay(customer.cep)} />

          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mt-4 mb-2">Padrões Protheus</p>
          <ViewRow label="Transp. Padrão"     value={customer.transpPadrao} />
          <ViewRow label="Cond. Pgto Padrão"  value={customer.condPagPadrao} />
          <ViewRow label="Código TES"          value={customer.tes} />
          <ViewRow label="Filial Faturamento"  value={customer.xcodemp} />
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={onClose}
            className="w-full border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg py-2.5 hover:bg-[var(--bg-subtle)] transition-colors">
            Fechar
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Identificação</p>
        <Field label="Nome *" value={name} onChange={setName} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cod. Protheus" value={protheusCode} onChange={setProtheusCode} placeholder="Opcional" />
          <Field label="Loja"          value={loja}         onChange={setLoja}         placeholder="01" />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">CPF / CNPJ</label>
          <input value={document} onChange={(e) => setDocument(maskDocument(e.target.value))} placeholder="000.000.000-00 ou 00.000.000/0000-00"
            className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cód. Vendedor"      value={vendorCode}    onChange={setVendorCode}    placeholder="Opcional" />
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Status Protheus</label>
            <select value={msblql} onChange={(e) => setMsblql(e.target.value)}
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="2">Liberado</option>
              <option value="1">Bloqueado</option>
            </select>
          </div>
        </div>

        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide pt-1">Contato</p>
        <Field label="E-mail"   value={email} onChange={setEmail} placeholder="Opcional" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="Opcional" />

        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide pt-1">Endereço</p>
        <Field label="Endereço" value={address} onChange={setAddress} placeholder="Opcional" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Município" value={municipio} onChange={setMunicipio} placeholder="Opcional" />
          <Field label="Bairro"    value={bairro}    onChange={setBairro}    placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">CEP</label>
            <input value={cep} onChange={(e) => setCep(maskCEP(e.target.value))} placeholder="00000-000"
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <Field label="UF" value={uf} onChange={setUf} placeholder="SP" />
        </div>

        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide pt-1">Padrões Protheus</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Transp. Padrão"    value={transpPadrao}  onChange={setTranspPadrao}  placeholder="Opcional" />
          <Field label="Cond. Pgto Padrão" value={condPagPadrao} onChange={setCondPagPadrao} placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código TES"         value={tes}     onChange={setTes}     placeholder="Opcional" />
          <Field label="Filial Faturamento" value={xcodemp} onChange={setXcodemp} placeholder="Opcional" />
        </div>

        <ModalActions loading={loading} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Modal Produto ────────────────────────────────────────────────────────────

interface ProductModalProps {
  companyId: string
  mode: ModalMode
  product?: Product
  onClose: () => void
  onSaved: () => void
}

export function ProductModal({ companyId, mode, product, onClose, onSaved }: ProductModalProps) {
  const [name,         setName]         = useState(product?.name         ?? '')
  const [protheusCode, setProtheusCode] = useState(mode === 'copy' ? '' : (product?.protheusCode ?? ''))
  const [description,  setDescription]  = useState(product?.description  ?? '')
  const [price,        setPrice]        = useState(product ? String(Number(product.price).toFixed(2)) : '0.00')
  const [unit,         setUnit]         = useState(product?.unit         ?? 'UN')
  const [stock,        setStock]        = useState(product ? String(Number(product.stock)) : '0')
  const [saldo,        setSaldo]        = useState(product ? String(Number(product.saldo)) : '0')
  const [error,        setError]        = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  const title = mode === 'create' ? 'Novo Produto'
              : mode === 'copy'   ? 'Copiar Produto'
              : mode === 'view'   ? 'Dados do Produto'
              : 'Editar Produto'

  if (mode === 'view' && product) {
    return (
      <Modal title={title} onClose={onClose}>
        <div className="space-y-1">
          <ViewRow label="Nome"           value={product.name} />
          <ViewRow label="Cód. Protheus"  value={product.protheusCode} />
          <ViewRow label="Unidade"        value={product.unit} />
          <ViewRow label="Descrição"      value={product.description} />
          <ViewRow label="Preço (R$)"     value={Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} />
          <ViewRow label="Estoque"        value={Number(product.stock).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} />
          <ViewRow label="Saldo"          value={Number(product.saldo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} />
          <ViewRow label="Status"         value={product.active ? 'Ativo' : 'Inativo'} />
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={onClose}
            className="w-full border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg py-2.5 hover:bg-[var(--bg-subtle)] transition-colors">
            Fechar
          </button>
        </div>
      </Modal>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = {
        name,
        protheusCode: protheusCode || undefined,
        description:  description  || undefined,
        price:        parseFloat(price)  || 0,
        unit:         unit || 'UN',
        stock:        parseFloat(stock)  || 0,
        saldo:        parseFloat(saldo)  || 0,
      }
      if (mode === 'edit' && product) {
        await api.patch(`/companies/${companyId}/products/${product.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/products`, body)
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao salvar produto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nome *" value={name} onChange={setName} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cod. Protheus" value={protheusCode} onChange={setProtheusCode} placeholder="Opcional" />
          <Field label="Unidade" value={unit} onChange={setUnit} placeholder="UN" />
        </div>
        <Field label="Descrição" value={description} onChange={setDescription} placeholder="Opcional" />
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Preço (R$)" value={price} onChange={setPrice} />
          <NumField label="Estoque" value={stock} onChange={setStock} />
          <NumField label="Saldo" value={saldo} onChange={setSaldo} />
        </div>
        <ModalActions loading={loading} onClose={onClose} submitLabel={mode === 'edit' ? 'Salvar' : 'Criar'} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Menu de ações ────────────────────────────────────────────────────────────

interface ActionMenuProps {
  onEdit:    () => void
  onCopy:    () => void
  onToggle:  () => void
  onView?:   () => void
  active:    boolean
  label?:    string
}

export function ActionMenu({ onEdit, onCopy, onToggle, onView, active, label }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [open])

  return (
    <div className="inline-block text-left">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
        title="Ações"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed z-40 w-44 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-modal overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            {onView && (
              <button
                onClick={() => { setOpen(false); onView() }}
                className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Visualizar {label}
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onEdit() }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Editar {label}
            </button>
            <button
              onClick={() => { setOpen(false); onCopy() }}
              className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Copiar {label}
            </button>
            <div className="border-t border-[var(--border)]" />
            <button
              onClick={() => { setOpen(false); onToggle() }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'text-red-500 hover:bg-red-500/10'
                  : 'text-green-500 hover:bg-green-500/10'
              }`}
            >
              {active ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
