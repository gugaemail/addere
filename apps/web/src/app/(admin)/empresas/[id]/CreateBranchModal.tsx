'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  companyId: string
  onClose: () => void
  onCreated: () => void
}

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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

export function ModalActions({ loading, onClose }: { loading: boolean; onClose: () => void }) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg py-2 hover:bg-gray-50 transition-colors"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors"
      >
        {loading ? 'Salvando...' : 'Criar'}
      </button>
    </div>
  )
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{message}</p>
  )
}
