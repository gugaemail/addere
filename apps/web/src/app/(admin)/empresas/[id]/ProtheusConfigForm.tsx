'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

interface CompanyProtheus {
  id: string
  apiToken: string | null; apiPord: string | null; apiCliente: string | null
  apiPedido: string | null; apiConsPed: string | null; apiCondPag: string | null
  apiTransp: string | null; apiMetaVend: string | null
  usrProtheus: string | null; passProtheus: string | null
}

interface Props {
  company: CompanyProtheus
  onSaved: (updated: CompanyProtheus) => void
}

function InputField({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow font-mono"
      />
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className={`text-sm truncate font-mono ${value ? 'text-[var(--text-secondary)]' : 'text-[var(--border)]'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function ProtheusConfigForm({ company, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [apiToken,    setApiToken]    = useState(company.apiToken    ?? '')
  const [apiPord,     setApiPord]     = useState(company.apiPord     ?? '')
  const [apiCliente,  setApiCliente]  = useState(company.apiCliente  ?? '')
  const [apiPedido,   setApiPedido]   = useState(company.apiPedido   ?? '')
  const [apiConsPed,  setApiConsPed]  = useState(company.apiConsPed  ?? '')
  const [apiCondPag,  setApiCondPag]  = useState(company.apiCondPag  ?? '')
  const [apiTransp,   setApiTransp]   = useState(company.apiTransp   ?? '')
  const [apiMetaVend, setApiMetaVend] = useState(company.apiMetaVend ?? '')
  const [usrProtheus, setUsrProtheus] = useState(company.usrProtheus ?? '')
  const [passProtheus, setPassProtheus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleEdit() {
    setApiToken(company.apiToken ?? '')
    setApiPord(company.apiPord ?? '')
    setApiCliente(company.apiCliente ?? '')
    setApiPedido(company.apiPedido ?? '')
    setApiConsPed(company.apiConsPed ?? '')
    setApiCondPag(company.apiCondPag ?? '')
    setApiTransp(company.apiTransp ?? '')
    setApiMetaVend(company.apiMetaVend ?? '')
    setUsrProtheus(company.usrProtheus ?? '')
    setPassProtheus('')
    setError(null)
    setEditing(true)
  }

  function handleCancel() {
    setError(null)
    setEditing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, string> = {
        apiToken, apiPord, apiCliente, apiPedido,
        apiConsPed, apiCondPag, apiTransp, apiMetaVend, usrProtheus,
      }
      if (passProtheus) body.passProtheus = passProtheus
      const { data } = await api.patch<CompanyProtheus>(`/companies/${company.id}/protheus`, body)
      onSaved(data)
      setEditing(false)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string }
      const apiMsg = e.response?.data?.message
      const status = e.response?.status
      if (apiMsg) {
        setError(status ? `[${status}] ${apiMsg}` : apiMsg)
      } else {
        setError(e.message ?? 'Erro ao salvar. Verifique a conexão com a API.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[var(--bg-surface)] rounded-xl shadow-card border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">Configuração das APIs Protheus</h2>
        {!editing && (
          <button
            onClick={handleEdit}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-brand-500/30 text-brand-500 hover:bg-brand-500/10 transition-colors"
          >
            Editar configuração
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">Deixe em branco para remover o valor configurado.</p>

          <div className="grid grid-cols-1 gap-3">
            <InputField label="Token de autenticação (POST)" value={apiToken} onChange={setApiToken} placeholder="http://..." />
            <InputField label="Produtos (POST)" value={apiPord} onChange={setApiPord} placeholder="http://..." />
            <InputField label="Clientes (GET)" value={apiCliente} onChange={setApiCliente} placeholder="http://..." />
            <InputField label="Pedido (POST)" value={apiPedido} onChange={setApiPedido} placeholder="http://..." />
            <InputField label="Consulta pedido (GET)" value={apiConsPed} onChange={setApiConsPed} placeholder="http://..." />
            <InputField label="Transportadoras (GET)" value={apiTransp} onChange={setApiTransp} placeholder="http://..." />
            <InputField label="Cond. pagamento (GET)" value={apiCondPag} onChange={setApiCondPag} placeholder="http://..." />
            <InputField label="Meta vendedor (GET)" value={apiMetaVend} onChange={setApiMetaVend} placeholder="http://..." />
          </div>

          <div className="border-t border-[var(--border)] pt-4 grid grid-cols-2 gap-3">
            <InputField label="Usuário Protheus" value={usrProtheus} onChange={setUsrProtheus} placeholder="usuario" />
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                Senha Protheus
                {company.passProtheus && <span className="normal-case font-normal ml-1">(em branco = manter)</span>}
              </label>
              <input
                type="password"
                value={passProtheus}
                onChange={(e) => setPassProtheus(e.target.value)}
                placeholder={company.passProtheus ? '••••••••' : 'Nova senha'}
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium rounded-lg py-2.5 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar configuração'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <ConfigRow label="Token (auth) POST"       value={company.apiToken} />
          <ConfigRow label="Produtos (POST)"         value={company.apiPord} />
          <ConfigRow label="Clientes (GET)"          value={company.apiCliente} />
          <ConfigRow label="Pedido (POST)"           value={company.apiPedido} />
          <ConfigRow label="Consulta pedido (GET)"   value={company.apiConsPed} />
          <ConfigRow label="Transportadoras (GET)"   value={company.apiTransp} />
          <ConfigRow label="Cond. pagamento (GET)"   value={company.apiCondPag} />
          <ConfigRow label="Meta vendedor (GET)"     value={company.apiMetaVend} />
          <ConfigRow label="Usuário Protheus"        value={company.usrProtheus} />
          <ConfigRow label="Senha Protheus"          value={company.passProtheus ? '••••••••' : null} />
        </div>
      )}
    </div>
  )
}
