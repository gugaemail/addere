'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { FormField } from '@/components/ui/FormField'

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
    setEditing(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
      toast.success('Configuração Protheus salva!')
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string }
      const apiMsg = e.response?.data?.message
      const status = e.response?.status
      if (apiMsg) {
        toast.error(status ? `[${status}] ${apiMsg}` : apiMsg)
      } else {
        toast.error(e.message ?? 'Erro ao salvar. Verifique a conexão com a API.')
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
            <FormField mono label="Token de autenticação (POST)" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder="http://..." />
            <FormField mono label="Produtos (POST)" value={apiPord} onChange={(e) => setApiPord(e.target.value)} placeholder="http://..." />
            <FormField mono label="Clientes (POST)" value={apiCliente} onChange={(e) => setApiCliente(e.target.value)} placeholder="http://..." />
            <FormField mono label="Pedido (POST)" value={apiPedido} onChange={(e) => setApiPedido(e.target.value)} placeholder="http://..." />
            <FormField mono label="Consulta pedido (GET)" value={apiConsPed} onChange={(e) => setApiConsPed(e.target.value)} placeholder="http://..." />
            <FormField mono label="Transportadoras (GET)" value={apiTransp} onChange={(e) => setApiTransp(e.target.value)} placeholder="http://..." />
            <FormField mono label="Cond. pagamento (GET)" value={apiCondPag} onChange={(e) => setApiCondPag(e.target.value)} placeholder="http://..." />
            <FormField mono label="Meta vendedor (GET)" value={apiMetaVend} onChange={(e) => setApiMetaVend(e.target.value)} placeholder="http://..." />
          </div>

          <div className="border-t border-[var(--border)] pt-4 grid grid-cols-2 gap-3">
            <FormField mono label="Usuário Protheus" value={usrProtheus} onChange={(e) => setUsrProtheus(e.target.value)} placeholder="usuario" />
            <FormField
              type="password"
              label={
                <>
                  Senha Protheus
                  {company.passProtheus && <span className="font-normal text-[var(--text-muted)] ml-1">(em branco = manter)</span>}
                </>
              }
              value={passProtheus}
              onChange={(e) => setPassProtheus(e.target.value)}
              placeholder={company.passProtheus ? '••••••••' : 'Nova senha'}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
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
          <ConfigRow label="Clientes (POST)"          value={company.apiCliente} />
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
