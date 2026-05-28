'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  companyId: string
  onClose: () => void
  onCreated: () => void
}

// CreateBranchModal é mantido para compatibilidade, mas o fluxo principal
// usa BranchModal (EntityModals.tsx) que suporta todos os campos.
export function CreateBranchModal({ companyId, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [idProtheus, setIdProtheus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post(`/companies/${companyId}/branches`, {
        name,
        cnpj: cnpj || undefined,
        idProtheus: idProtheus || undefined,
      })
      onCreated()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null
      setError(message ?? 'Erro ao criar filial.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Nova Filial" onClose={onClose}>
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

// ─── Utilitários de formulário compartilhados ─────────────────────────────────

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-backdrop-in"
        onClick={onClose}
      />
      {/* Card */}
      <div className={`relative bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-modal w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 space-y-5 animate-modal-in`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--bg-subtle)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({
  label, value, onChange, required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
      />
    </div>
  )
}

export function ModalActions({ loading, onClose, submitLabel = 'Criar' }: { loading: boolean; onClose: () => void; submitLabel?: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
      >
        {loading ? 'Salvando...' : submitLabel}
      </button>
    </div>
  )
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      {message}
    </div>
  )
}
