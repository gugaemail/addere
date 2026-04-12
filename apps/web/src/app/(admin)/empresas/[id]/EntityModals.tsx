'use client'

import { useState, useRef, useEffect } from 'react'
import { api } from '@/lib/api'
import { Modal, Field, ModalActions, ErrorMsg } from './CreateBranchModal'

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface Branch    { id: string; name: string; cnpj: string | null; idProtheus: string | null; active: boolean }
interface User      { id: string; name: string; email: string; role: 'ADMIN' | 'SALESPERSON'; active: boolean }
interface Customer  { id: string; name: string; document: string | null; email: string | null; phone: string | null; protheusCode: string | null; loja: string | null; address: string | null; municipio: string | null; bairro: string | null; cep: string | null; uf: string | null; active: boolean }
interface Product   { id: string; name: string; protheusCode: string | null; price: string; unit: string; stock: string; saldo: string; description: string | null; active: boolean }

type ModalMode = 'create' | 'edit' | 'copy'

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
        <ModalActions loading={loading} onClose={onClose} />
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
  const [name,     setName]     = useState(user?.name  ?? '')
  const [email,    setEmail]    = useState(mode === 'copy' ? '' : (user?.email ?? ''))
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'ADMIN' | 'SALESPERSON'>(user?.role ?? 'SALESPERSON')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

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
        await api.patch(`/companies/${companyId}/users/${user.id}`, body)
      } else {
        await api.post(`/companies/${companyId}/users`, { name, email, password, role })
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
        <ModalActions loading={loading} onClose={onClose} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Modal Cliente ────────────────────────────────────────────────────────────

interface CustomerModalProps {
  companyId: string
  mode: ModalMode
  customer?: Customer
  onClose: () => void
  onSaved: () => void
}

export function CustomerModal({ companyId, mode, customer, onClose, onSaved }: CustomerModalProps) {
  const [name,         setName]         = useState(customer?.name         ?? '')
  const [protheusCode, setProtheusCode] = useState(mode === 'copy' ? '' : (customer?.protheusCode ?? ''))
  const [loja,         setLoja]         = useState(mode === 'copy' ? '' : (customer?.loja         ?? ''))
  const [document,     setDocument]     = useState(customer?.document     ?? '')
  const [email,        setEmail]        = useState(customer?.email        ?? '')
  const [phone,        setPhone]        = useState(customer?.phone        ?? '')
  const [address,      setAddress]      = useState(customer?.address      ?? '')
  const [municipio,    setMunicipio]    = useState(customer?.municipio    ?? '')
  const [bairro,       setBairro]       = useState(customer?.bairro       ?? '')
  const [cep,          setCep]          = useState(customer?.cep          ?? '')
  const [uf,           setUf]           = useState(customer?.uf           ?? '')
  const [error,        setError]        = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  const title = mode === 'create' ? 'Novo Cliente' : mode === 'copy' ? 'Copiar Cliente' : 'Editar Cliente'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = {
        name,
        protheusCode: protheusCode || undefined,
        loja:         loja         || undefined,
        document:     document     || undefined,
        email:        email        || undefined,
        phone:        phone        || undefined,
        address:      address      || undefined,
        municipio:    municipio    || undefined,
        bairro:       bairro       || undefined,
        cep:          cep          || undefined,
        uf:           uf           || undefined,
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

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <Field label="Nome *" value={name} onChange={setName} required />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cod. Protheus" value={protheusCode} onChange={setProtheusCode} placeholder="Opcional" />
          <Field label="Loja" value={loja} onChange={setLoja} placeholder="01" />
        </div>
        <Field label="CPF / CNPJ" value={document} onChange={setDocument} placeholder="Opcional" />
        <Field label="E-mail" value={email} onChange={setEmail} placeholder="Opcional" />
        <Field label="Telefone" value={phone} onChange={setPhone} placeholder="Opcional" />
        <Field label="Endereço" value={address} onChange={setAddress} placeholder="Opcional" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Município" value={municipio} onChange={setMunicipio} placeholder="Opcional" />
          <Field label="Bairro" value={bairro} onChange={setBairro} placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CEP" value={cep} onChange={setCep} placeholder="Opcional" />
          <Field label="UF" value={uf} onChange={setUf} placeholder="SP" />
        </div>
        <ModalActions loading={loading} onClose={onClose} />
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

  const title = mode === 'create' ? 'Novo Produto' : mode === 'copy' ? 'Copiar Produto' : 'Editar Produto'

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
        <ModalActions loading={loading} onClose={onClose} />
        {error && <ErrorMsg message={error} />}
      </form>
    </Modal>
  )
}

// ─── Menu de ações ────────────────────────────────────────────────────────────

interface ActionMenuProps {
  onEdit:   () => void
  onCopy:   () => void
  onToggle: () => void
  active:   boolean
  label?:   string
}

export function ActionMenu({ onEdit, onCopy, onToggle, active, label }: ActionMenuProps) {
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
