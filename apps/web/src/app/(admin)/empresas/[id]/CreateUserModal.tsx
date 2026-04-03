'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { Modal, Field, ModalActions, ErrorMsg } from './CreateBranchModal'

interface Props {
  companyId: string
  onClose: () => void
  onCreated: () => void
}

export function CreateUserModal({ companyId, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'SALESPERSON'>('SALESPERSON')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post(`/companies/${companyId}/users`, { name, email, password, role })
      onCreated()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null
      setError(message ?? 'Erro ao criar usuário.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Novo Usuário" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome" value={name} onChange={setName} required />
        <Field label="E-mail" value={email} onChange={setEmail} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'ADMIN' | 'SALESPERSON')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
