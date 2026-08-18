'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CompanyDetail, SyncSchedule } from '@addere/types'
import { api, getApiErrorMessage } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { companiesKeys } from '@/hooks/useCompanies'
import {
  useCompanySyncSchedule, useSaveSyncSchedule, useRunSync,
  SYNC_ENTITY_LABELS, type SyncEntity, type SyncResult,
} from '@/hooks/useCompany'
import { ProtheusConfigForm } from '../ProtheusConfigForm'

type TestKind = 'token' | 'products' | 'customers'

const TEST_TITLES: Record<TestKind, string> = {
  token: 'Testar Token',
  products: 'Testar Produtos',
  customers: 'Testar Clientes',
}

const DEFAULT_SCHEDULE: SyncSchedule = {
  products:  { interv: 0, scheduleMin: 0, auto: false },
  customers: { interv: 0, scheduleMin: 0, auto: false },
}

const spinner = <Loader2 className="w-4 h-4 animate-spin shrink-0" />
const warnIcon = <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border)]">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function ProtheusTab({ company }: { company: CompanyDetail }) {
  const queryClient = useQueryClient()
  const runSync = useRunSync(company.id)
  const saveSchedule = useSaveSyncSchedule(company.id)
  const { data: remoteSchedule } = useCompanySyncSchedule(company.id)

  const [schedule, setSchedule] = useState<SyncSchedule>(DEFAULT_SCHEDULE)
  const [syncResult, setSyncResult] = useState<{ entity: string; result: SyncResult } | null>(null)

  // Diagnóstico (Testar Token / Produtos / Clientes)
  const [testing, setTesting] = useState<TestKind | null>(null)
  const [testTitle, setTestTitle] = useState('')
  const [testResult, setTestResult] = useState<unknown>(null)
  const [showTestModal, setShowTestModal] = useState(false)

  useEffect(() => {
    if (remoteSchedule) setSchedule(remoteSchedule)
  }, [remoteSchedule])

  // Uma única função parametrizada no lugar das antigas syncProducts/syncCustomers/etc.
  async function handleSync(entity: SyncEntity) {
    setSyncResult(null)
    try {
      const result = await runSync.mutateAsync(entity)
      setSyncResult({ entity: SYNC_ENTITY_LABELS[entity], result })
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao sincronizar'))
    }
  }

  // Uma única função parametrizada no lugar das antigas testToken/testProducts/testCustomers.
  // Em caso de erro a resposta bruta ainda é exibida no modal de diagnóstico.
  async function handleTest(kind: TestKind) {
    setTesting(kind)
    setTestResult(null)
    setTestTitle(TEST_TITLES[kind])
    try {
      const { data } = await api.post(`/sync/test-${kind}`, { companyId: company.id })
      setTestResult(data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message: string }
      setTestResult(e.response?.data ?? { error: e.message })
    } finally {
      setTesting(null)
      setShowTestModal(true)
    }
  }

  const syncing = (entity: SyncEntity) => runSync.isPending && runSync.variables === entity

  const hasActiveBranch = company.branches.some((b) => b.active && b.idProtheus)
  const missingProd = !company.apiPord || !company.apiToken
    ? 'Configure apiToken e apiPord para habilitar.'
    : !hasActiveBranch ? 'Nenhuma filial ativa com Código Protheus configurado (aba Filiais).' : undefined

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
        onSaved={() => queryClient.invalidateQueries({ queryKey: companiesKeys.detail(company.id) })}
      />

      {syncResult && (
        <div className="flex items-start gap-2 p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-500" strokeWidth={2} />
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

      {/* ── Autenticação ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <CardHeader title="Autenticação" subtitle="Valide a conexão com o Protheus antes de sincronizar." />
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Testar autenticação Protheus</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Chama o endpoint <code className="bg-[var(--bg-subtle)] px-1 rounded">apiToken</code> e exibe a resposta bruta para diagnóstico.</p>
          </div>
          <button onClick={() => handleTest('token')} disabled={testing === 'token' || !company.apiToken || !company.usrProtheus || !company.passProtheus}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {testing === 'token' && spinner}{testing === 'token' ? 'Testando…' : 'Testar Token'}
          </button>
        </div>
      </div>

      {/* ── Produtos ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <CardHeader title="Produtos" />
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Testar API</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Busca página 1 via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiPord</code> — sem salvar no banco.</p>
              </div>
              <button onClick={() => handleTest('products')} disabled={testing === 'products' || !company.apiPord || !company.apiToken || !company.usrProtheus || !company.passProtheus}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {testing === 'products' && spinner}{testing === 'products' ? 'Testando…' : 'Testar API'}
              </button>
            </div>
            <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Sincronizar</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiPord</code> e atualiza o catálogo.</p>
                {missingProd && <p className="flex items-start gap-1 mt-1.5 text-xs text-yellow-600">{warnIcon}{missingProd}</p>}
              </div>
              <button onClick={() => handleSync('products')} disabled={syncing('products') || !!missingProd}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {syncing('products') && spinner}{syncing('products') ? 'Sincronizando…' : 'Sincronizar Produtos'}
              </button>
            </div>
          </div>
          {scheduleSection('products')}
        </div>
      </div>

      {/* ── Clientes ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <CardHeader title="Clientes" />
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Testar API</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Busca página 1 via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCliente</code> — sem salvar no banco.</p>
              </div>
              <button onClick={() => handleTest('customers')} disabled={testing === 'customers' || !company.apiCliente || !company.apiToken || !company.usrProtheus || !company.passProtheus}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {testing === 'customers' && spinner}{testing === 'customers' ? 'Testando…' : 'Testar API'}
              </button>
            </div>
            <div className="border border-[var(--border)] rounded-lg p-3 flex flex-col justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Sincronizar</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCliente</code> e atualiza a base.</p>
                {(!company.apiCliente || !company.apiToken) && <p className="flex items-start gap-1 mt-1.5 text-xs text-yellow-600">{warnIcon}Configure apiToken e apiCliente para habilitar.</p>}
              </div>
              <button onClick={() => handleSync('customers')} disabled={syncing('customers') || !company.apiCliente || !company.apiToken}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {syncing('customers') && spinner}{syncing('customers') ? 'Sincronizando…' : 'Sincronizar Clientes'}
              </button>
            </div>
          </div>
          {scheduleSection('customers')}
        </div>
      </div>

      {/* ── Transportadoras ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <CardHeader title="Transportadoras" />
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiTransp</code> e atualiza a lista disponível nos pedidos.</p>
            {(!company.apiTransp || !company.apiToken) && <p className="flex items-center gap-1 mt-1.5 text-xs text-yellow-600">{warnIcon}Configure apiToken e apiTransp para habilitar.</p>}
          </div>
          <button onClick={() => handleSync('transportadoras')} disabled={syncing('transportadoras') || !company.apiTransp || !company.apiToken}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {syncing('transportadoras') && spinner}{syncing('transportadoras') ? 'Sincronizando…' : 'Sincronizar Transportadoras'}
          </button>
        </div>
      </div>

      {/* ── Condições de Pagamento ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <CardHeader title="Condições de Pagamento" />
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Importa via <code className="bg-[var(--bg-subtle)] px-1 rounded">apiCondPag</code> e atualiza as opções disponíveis nos pedidos.</p>
            {(!company.apiCondPag || !company.apiToken) && <p className="flex items-center gap-1 mt-1.5 text-xs text-yellow-600">{warnIcon}Configure apiToken e apiCondPag para habilitar.</p>}
          </div>
          <button onClick={() => handleSync('cond-pags')} disabled={syncing('cond-pags') || !company.apiCondPag || !company.apiToken}
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {syncing('cond-pags') && spinner}{syncing('cond-pags') ? 'Sincronizando…' : 'Sincronizar Cond. Pagamento'}
          </button>
        </div>
      </div>

      {/* ── Salvar auto-sync ── */}
      <div className="flex items-center gap-4 pt-1">
        <button onClick={() => saveSchedule.mutate(schedule)} disabled={saveSchedule.isPending}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {saveSchedule.isPending ? 'Salvando…' : 'Salvar configuração auto-sync'}
        </button>
      </div>

      {/* ── Modal de diagnóstico ── */}
      <Modal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        className="max-w-2xl"
        title={
          <span className="flex items-center gap-2">
            {(testResult as { ok?: boolean })?.ok === false ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500">
                <AlertCircle className="w-4 h-4" strokeWidth={2} />
                {testTitle} — Falha
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-500">
                <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                {testTitle} — Sucesso
              </span>
            )}
            {(testResult as { ms?: number })?.ms != null && (
              <span className="text-xs font-normal text-[var(--text-muted)]">
                {(testResult as { ms: number }).ms} ms
              </span>
            )}
          </span>
        }
      >
        <div className="overflow-auto max-h-[60vh]">
          <pre className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-subtle)] rounded-xl p-4 whitespace-pre-wrap break-all">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
