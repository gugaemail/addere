'use client'

// W3 · Consultas da Inteligência (E10): editor SQL por contrato, prévia com
// checagens, reconciliação com o número oficial, publicar e carga inicial.
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  Play,
  Rocket,
  XCircle,
} from 'lucide-react'
import type { QueryPreviewResult, ReconciliationResult } from '@addere/types'
import { getApiErrorMessage } from '@/lib/api'
import { backfillProgress, brl, formatDiffPct, periodLabel } from '@/lib/intel-helpers'
import { useAuth } from '@/contexts/AuthContext'
import {
  useBackfillQuery,
  useIntelQueries,
  useJobsStatus,
  usePreviewQuery,
  usePublishQuery,
  useReconcileQuery,
  useSaveQueryDraft,
  type QueryContractDto,
} from '@/hooks/useIntel'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import { Textarea } from '@/components/ui/Textarea'
import { FormField } from '@/components/ui/FormField'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { needsActiveCompany } from '@/lib/intel-helpers'
import { SelectCompanyNotice } from '@/components/intel/SelectCompanyNotice'

// URL em português ↔ nome do contrato na API
const SLUG_TO_NAME: Record<string, string> = {
  vendas: 'SALES',
  clientes: 'CUSTOMERS',
  titulos: 'OPEN_TITLES',
  produtos: 'PRODUCTS',
  estoque: 'STOCK',
}
const NAME_TO_SLUG = Object.fromEntries(Object.entries(SLUG_TO_NAME).map(([s, n]) => [n, s]))

const STATUS_DOT: Record<QueryContractDto['status'], string> = {
  published: 'bg-success',
  draft: 'bg-warning',
  missing: 'bg-[var(--border)]',
}

const TABS = [
  { key: 'sql', label: 'SQL' },
  { key: 'meaning', label: 'O que significa' },
  { key: 'validate', label: 'Validar e publicar' },
]

export default function ConsultaPage() {
  const router = useRouter()
  const params = useParams<{ name: string }>()
  const contractName = SLUG_TO_NAME[params.name]
  const { hasPermission, isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  const canEdit = hasPermission('intel.admin')

  const { data, isLoading } = useIntelQueries()
  const contract = data?.contracts.find((c) => c.name === contractName)

  // Editor local — semeado do rascunho salvo (ou do SQL de referência)
  const [tab, setTab] = useState('sql')
  const [sql, setSql] = useState('')
  const [definition, setDefinition] = useState('')
  const [exclusions, setExclusions] = useState('')
  const [gotchas, setGotchas] = useState('')
  const [seededFor, setSeededFor] = useState<string | null>(null)

  useEffect(() => {
    if (!contract || seededFor === contract.name) return
    setSql(contract.query?.sql ?? contract.referenceSql)
    setDefinition(contract.query?.definition ?? '')
    setExclusions(contract.query?.exclusions ?? '')
    setGotchas(contract.query?.gotchas ?? '')
    setSeededFor(contract.name)
    setTab('sql')
  }, [contract, seededFor])

  // Slug inválido → contrato principal
  useEffect(() => {
    if (!contractName) router.replace('/inteligencia/consultas/vendas')
  }, [contractName, router])

  const saveDraft = useSaveQueryDraft(contractName ?? '')
  const preview = usePreviewQuery(contractName ?? '')
  const reconcile = useReconcileQuery(contractName ?? '')
  const publish = usePublishQuery(contractName ?? '')
  const backfill = useBackfillQuery(contractName ?? '')

  // Carga inicial em andamento? Poll do job SYNC com metadata de backfill
  const [pollJobs, setPollJobs] = useState(false)
  const jobs = useJobsStatus({ refetchInterval: pollJobs ? 2500 : false })
  const backfillRun = useMemo(() => {
    const runs = [...(jobs.data?.latest ?? []), ...(jobs.data?.recent ?? [])]
    return runs.find((r) => {
      const progress = backfillProgress(r.metadata)
      return r.job === 'SYNC' && progress && progress.contract === contractName
    })
  }, [jobs.data, contractName])
  const backfillRunning = backfillRun?.status === 'RUNNING'
  useEffect(() => {
    if (backfillRunning && !pollJobs) setPollJobs(true)
    if (!backfillRunning && pollJobs && backfillRun) {
      setPollJobs(false)
      if (backfillRun.status === 'OK') toast.success('Carga inicial concluída')
      if (backfillRun.status === 'ERROR') toast.error('Carga inicial terminou com erro — veja a Saúde')
    }
  }, [backfillRunning, pollJobs, backfillRun])

  // Prévia (modal) e reconciliação
  const [previewResult, setPreviewResult] = useState<QueryPreviewResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [period, setPeriod] = useState('')
  const [refAmount, setRefAmount] = useState('')
  const [reconResult, setReconResult] = useState<ReconciliationResult | null>(null)

  // Sem empresa ativa o tenant não resolve e a tela cairia num vazio genérico
  if (needsActiveCompany(isSuperAdmin, companyId)) return <SelectCompanyNotice />

  if (isLoading || !contractName) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }
  if (!data || !contract) {
    return <p className="text-sm text-[var(--text-secondary)]">Contrato não encontrado.</p>
  }

  const query = contract.query
  const contractLabel = contract.labelPt
  const dirty =
    sql !== (query?.sql ?? contract.referenceSql) ||
    definition !== (query?.definition ?? '') ||
    exclusions !== (query?.exclusions ?? '') ||
    gotchas !== (query?.gotchas ?? '')
  const canPublish =
    canEdit && query && !query.published && query.validatedAt && query.reconciliationDiffPct !== null

  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync({ sql, definition, exclusions, gotchas })
      toast.success('Rascunho salvo — prévia e reconciliação precisam rodar de novo')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar rascunho'))
    }
  }

  async function handlePreview() {
    try {
      const result = await preview.mutateAsync()
      setPreviewResult(result)
      setShowPreview(true)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao rodar a prévia'))
    }
  }

  async function handleReconcile() {
    const yyyymm = period.replace('-', '')
    const amount = Number(refAmount.replace(/\./g, '').replace(',', '.'))
    if (!/^\d{6}$/.test(yyyymm)) return toast.error('Informe o mês da reconciliação')
    if (!Number.isFinite(amount) || amount <= 0) return toast.error('Informe o valor oficial do mês')
    try {
      const result = await reconcile.mutateAsync({ period: yyyymm, refAmount: amount })
      setReconResult(result)
      if (result.withinTolerance) toast.success(`Bateu: diferença de ${formatDiffPct(result.diffPct)}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro na reconciliação'))
    }
  }

  async function handlePublish() {
    try {
      await publish.mutateAsync()
      toast.success(`Consulta ${contractLabel} publicada`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao publicar'))
    }
  }

  async function handleBackfill() {
    try {
      await backfill.mutateAsync()
      setPollJobs(true)
      toast.success('Carga inicial iniciada (13 meses)')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao iniciar a carga'))
    }
  }

  const progress = backfillRun ? backfillProgress(backfillRun.metadata) : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-xl font-bold text-[var(--text-primary)]">Consultas</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          O que o Addere lê do Protheus — valide cada consulta contra um número oficial antes de publicar.
        </p>
      </div>

      {!data.sqlEndpointConfigured && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            O endpoint SQL genérico ainda não foi cadastrado — a prévia e o sync vão falhar. Cadastre em
            Empresas → aba Protheus → &quot;SQL genérico (POST)&quot;.
          </span>
        </div>
      )}

      {/* Chips: 5 contratos + metas via API */}
      <div className="flex flex-wrap gap-2">
        {data.contracts.map((c) => {
          const active = c.name === contract.name
          return (
            <Link
              key={c.name}
              href={`/inteligencia/consultas/${NAME_TO_SLUG[c.name]}`}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand bg-brand text-white'
                  : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-brand/40'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${active ? 'bg-white' : STATUS_DOT[c.status]}`} aria-hidden />
              {c.labelPt}
            </Link>
          )
        })}
        <span
          className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--border)] px-3.5 py-1.5 text-sm text-[var(--text-secondary)]"
          title={
            data.goalMeta.viaApi
              ? `Metas lidas da API dedicada (apiMetaVend) — último snapshot: ${
                  data.goalMeta.lastSnapshotAt ? new Date(data.goalMeta.lastSnapshotAt).toLocaleString('pt-BR') : 'nunca'
                }`
              : 'API de metas (apiMetaVend) não cadastrada nesta empresa'
          }
        >
          <Database size={13} strokeWidth={1.5} aria-hidden />
          metas (API) {data.goalMeta.viaApi ? '· ativa' : '· não cadastrada'}
        </span>
      </div>

      {/* Versão e estado da consulta ativa */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        {query ? (
          <>
            <span>
              v{query.version} · {query.published ? 'publicada' : 'rascunho'}
              {query.publishedAt && ` em ${new Date(query.publishedAt).toLocaleDateString('pt-BR')}`}
            </span>
            <span>
              prévia: {query.validatedAt ? `ok em ${new Date(query.validatedAt).toLocaleString('pt-BR')}` : 'pendente'}
            </span>
            <span>
              reconciliação:{' '}
              {query.reconciliationDiffPct !== null
                ? `${formatDiffPct(query.reconciliationDiffPct)} em ${periodLabel(query.reconciliationPeriod)}`
                : 'pendente'}
            </span>
          </>
        ) : (
          <span>Ainda não configurada — o editor abre com o SQL de referência.</span>
        )}
        {dirty && canEdit && <span className="font-medium text-warning">alterações não salvas</span>}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'sql' && (
        <div className="space-y-4">
          <Textarea
            label={`SQL — ${contract.labelPt}`}
            mono
            rows={16}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            disabled={!canEdit}
            hint={`Placeholders obrigatórios: ${contract.requiredPlaceholders.join(', ') || 'nenhum'}${
              contract.optionalPlaceholders.length ? ` · opcionais: ${contract.optionalPlaceholders.join(', ')}` : ''
            }`}
          />
          <div className="flex flex-wrap items-center gap-3">
            {canEdit && (
              <>
                <Button onClick={handleSaveDraft} disabled={saveDraft.isPending || !dirty}>
                  {saveDraft.isPending ? 'Salvando…' : 'Salvar rascunho'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSql(contract.referenceSql)}
                  disabled={sql === contract.referenceSql}
                >
                  Usar SQL de referência
                </Button>
              </>
            )}
            <span className="text-xs text-[var(--text-secondary)]">
              Colunas esperadas: {contract.columns.map((c) => c.name + (c.required ? '' : '?')).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {tab === 'meaning' && (
        <div className="max-w-3xl space-y-4">
          <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            {contract.helpText}
          </p>
          <Textarea
            label="O que esta consulta significa"
            rows={3}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            disabled={!canEdit}
            hint="Ex.: faturamento líquido por item, sem devoluções"
          />
          <Textarea
            label="O que fica de fora"
            rows={3}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            disabled={!canEdit}
            hint="Ex.: notas de bonificação, filial 0102"
          />
          <Textarea
            label="Pegadinhas conhecidas"
            rows={3}
            value={gotchas}
            onChange={(e) => setGotchas(e.target.value)}
            disabled={!canEdit}
            hint="Ex.: D2_TOTAL já vem com desconto aplicado"
          />
          {canEdit && (
            <Button onClick={handleSaveDraft} disabled={saveDraft.isPending || !dirty}>
              {saveDraft.isPending ? 'Salvando…' : 'Salvar rascunho'}
            </Button>
          )}
        </div>
      )}

      {tab === 'validate' && (
        <div className="max-w-3xl space-y-5">
          {/* Passo 1 — prévia */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">1 · Prévia (últimos 7 dias)</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Roda o SQL salvo contra o Protheus com checagens de guarda, colunas e tempo.
                </p>
              </div>
              {canEdit && (
                <Button onClick={handlePreview} disabled={preview.isPending || !query || dirty}>
                  <Play size={14} strokeWidth={1.5} aria-hidden />
                  {preview.isPending ? 'Rodando…' : 'Rodar prévia'}
                </Button>
              )}
            </div>
            {dirty && <p className="mt-2 text-xs text-warning">Salve o rascunho antes de rodar a prévia.</p>}
            {query?.validatedAt && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 size={13} aria-hidden /> Prévia ok em {new Date(query.validatedAt).toLocaleString('pt-BR')}
                {query.validatedBy && ` por ${query.validatedByName ?? query.validatedBy}`}
              </p>
            )}
          </section>

          {/* Passo 2 — reconciliação */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">2 · Reconciliação com o número oficial</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Compare um mês fechado com o total que o financeiro considera correto.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <FormField
                label="Mês"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={!canEdit}
                className="w-40"
              />
              <FormField
                label="Valor oficial (R$)"
                type="text"
                inputMode="decimal"
                placeholder="1.234.567,89"
                value={refAmount}
                onChange={(e) => setRefAmount(e.target.value)}
                disabled={!canEdit}
                className="w-44"
              />
              {canEdit && (
                <Button variant="secondary" onClick={handleReconcile} disabled={reconcile.isPending || !query || dirty}>
                  {reconcile.isPending ? 'Comparando…' : 'Comparar'}
                </Button>
              )}
            </div>
            {(reconResult || query?.reconciliationDiffPct !== null) && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-[var(--bg-page)] px-3 py-2.5 text-sm">
                {reconResult ? (
                  <>
                    <p className="text-[var(--text-primary)]">
                      Addere {brl(reconResult.calcAmount)} × oficial {brl(reconResult.refAmount)} →{' '}
                      <b className={reconResult.withinTolerance ? 'text-success' : 'text-danger'}>
                        {formatDiffPct(reconResult.diffPct)}
                      </b>{' '}
                      em {periodLabel(reconResult.period)}
                    </p>
                    {!reconResult.withinTolerance && reconResult.probableCauses.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-[var(--text-secondary)]">
                        {reconResult.probableCauses.map((cause) => (
                          <li key={cause}>{cause}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Última reconciliação: {formatDiffPct(query?.reconciliationDiffPct)} em{' '}
                    {periodLabel(query?.reconciliationPeriod)}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Passo 3 — publicar */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">3 · Publicar</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Libera a versão para o sync noturno. Exige prévia ok + reconciliação dentro da tolerância.
                </p>
              </div>
              {canEdit &&
                (query?.published ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2 size={15} aria-hidden /> v{query.version} publicada
                  </span>
                ) : (
                  <Button onClick={handlePublish} disabled={!canPublish || publish.isPending}>
                    <Rocket size={14} strokeWidth={1.5} aria-hidden />
                    {publish.isPending ? 'Publicando…' : `Publicar v${query?.version ?? 1}`}
                  </Button>
                ))}
            </div>
          </section>

          {/* Passo 4 — carga inicial (P5) */}
          {query?.published && canEdit && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">4 · Carga inicial (13 meses)</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Traz o histórico completo em janelas mensais. Rode fora do horário comercial.
                  </p>
                </div>
                <Button variant="secondary" onClick={handleBackfill} disabled={backfill.isPending || backfillRunning}>
                  {backfillRunning ? 'Em andamento…' : 'Iniciar carga'}
                </Button>
              </div>
              {progress && backfillRunning && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-page)]">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {progress.done} de {progress.total} janelas ({progress.pct}%)
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Modal da prévia */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={`Prévia — ${contract.labelPt}`}
        className="max-w-4xl"
      >
        {previewResult && (
          <div className="space-y-4">
            <ul className="space-y-1.5">
              {previewResult.checks.map((check) => (
                <li key={check.key} className="flex items-start gap-2 text-sm">
                  {check.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                  )}
                  <span className="text-[var(--text-primary)]">
                    {check.label}
                    {check.detail && <span className="text-[var(--text-secondary)]"> — {check.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {previewResult.error && <p className="text-sm text-danger">{previewResult.error}</p>}
            <p className="text-xs text-[var(--text-secondary)]">
              {previewResult.stats.rows} linha(s) em {previewResult.ms} ms
              {previewResult.stats.distinctOrders !== undefined && ` · ${previewResult.stats.distinctOrders} pedidos`}
              {previewResult.stats.distinctCustomers !== undefined && ` · ${previewResult.stats.distinctCustomers} clientes`}
            </p>
            {previewResult.rows.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-[var(--bg-page)]">
                    <tr>
                      {previewResult.columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.rows.map((row, i) => (
                      <tr key={i} className="border-t border-[var(--border)]">
                        {previewResult.columns.map((col) => (
                          <td key={col} className="whitespace-nowrap px-3 py-1.5 text-[var(--text-primary)]">
                            {row[col] === null || row[col] === undefined ? (
                              <CircleDashed size={11} className="text-[var(--text-secondary)]" aria-hidden />
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
