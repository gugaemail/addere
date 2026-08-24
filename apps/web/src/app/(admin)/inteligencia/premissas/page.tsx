'use client'

// W5 · Premissas do motor (E10): parâmetros em 3 blocos, valor vs padrão,
// edição para intel.admin (pesos precisam somar 100) e histórico de mudanças.
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { History } from 'lucide-react'
import { DEFAULT_INTEL_PARAMETERS, type IntelParameterKey } from '@addere/types'
import { getApiErrorMessage } from '@/lib/api'
import { weightsSum, WEIGHT_KEYS } from '@/lib/intel-helpers'
import { useAuth } from '@/contexts/AuthContext'
import {
  useIntelParameters,
  useParameterHistory,
  useSaveParameters,
  type ParameterRow,
} from '@/hooks/useIntel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'

interface ParamMeta {
  key: IntelParameterKey
  label: string
  hint?: string
  kind: 'number' | 'select' | 'switch'
  options?: { value: string; label: string }[]
  step?: string
}

const BLOCKS: { title: string; subtitle: string; params: ParamMeta[] }[] = [
  {
    title: 'Régua de status',
    subtitle: 'Quando um cliente vira atrasado, em risco ou inativo',
    params: [
      { key: 'late_factor', label: 'Atrasado a partir de (× ciclo)', kind: 'number', step: '0.1' },
      { key: 'risk_factor', label: 'Em risco a partir de (× ciclo)', kind: 'number', step: '0.1' },
      { key: 'risk_days', label: '…ou em risco após (dias)', kind: 'number' },
      { key: 'active_days', label: 'Cliente ativo = comprou em (dias)', kind: 'number' },
      { key: 'cycle_min_orders', label: 'Ciclo confiável a partir de (pedidos)', kind: 'number' },
      { key: 'blocked_days', label: 'Bloqueia com título vencido há (dias)', kind: 'number' },
      { key: 'visited_cooldown_days', label: 'Não sugerir de novo por (dias)', kind: 'number', hint: 'após visita registrada' },
    ],
  },
  {
    title: 'Plano do dia',
    subtitle: 'Capacidade e composição da lista',
    params: [
      { key: 'visits_per_day', label: 'Visitas por dia (padrão)', kind: 'number', hint: 'cada vendedor pode ter o seu' },
      {
        key: 'group_by',
        label: 'Agrupar paradas por',
        kind: 'select',
        options: [
          { value: 'city', label: 'Cidade' },
          { value: 'district', label: 'Bairro' },
        ],
      },
      { key: 'max_same_status_pct', label: 'Máx. do mesmo status (%)', kind: 'number' },
      { key: 'saturday_workday', label: 'Sábado conta como dia útil', kind: 'switch' },
    ],
  },
  {
    title: 'Pesos do ranking',
    subtitle: 'Precisam somar 100',
    params: [
      { key: 'weight_value', label: 'Valor (potencial de venda)', kind: 'number' },
      { key: 'weight_urgency', label: 'Urgência (atraso no ciclo)', kind: 'number' },
      { key: 'weight_risk', label: 'Risco (título vencido / crédito)', kind: 'number' },
      { key: 'reconciliation_tolerance_pct', label: 'Tolerância da reconciliação (%)', kind: 'number', step: '0.5', hint: 'usada na tela de Consultas' },
    ],
  },
]

export default function PremissasPage() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('intel.admin')
  const { data: parameters, isLoading } = useIntelParameters()
  const save = useSaveParameters()
  const [showHistory, setShowHistory] = useState(false)
  const history = useParameterHistory(showHistory)

  // Estado local editável, semeado da API
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!parameters || seeded) return
    setValues(Object.fromEntries(parameters.filter((p) => p.segment === '').map((p) => [p.key, p.value])))
    setSeeded(true)
  }, [parameters, seeded])

  const rowByKey = useMemo(() => {
    const map = new Map<string, ParameterRow>()
    for (const p of parameters ?? []) if (p.segment === '') map.set(p.key, p)
    return map
  }, [parameters])

  if (isLoading || !seeded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const sum = weightsSum(values)
  const weightsOk = sum === 100
  const dirty = (parameters ?? []).some((p) => p.segment === '' && values[p.key] !== p.value)

  function setValue(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!weightsOk) return toast.error(`Os pesos somam ${sum} — precisam somar 100`)
    const changed: Partial<Record<IntelParameterKey, unknown>> = {}
    for (const p of parameters ?? []) {
      if (p.segment === '' && values[p.key] !== p.value) changed[p.key] = values[p.key]
    }
    try {
      await save.mutateAsync(changed)
      setSeeded(false) // re-semeia do servidor
      toast.success('Premissas salvas — valem a partir do próximo cálculo do motor')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar premissas'))
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-[var(--text-primary)]">Premissas do motor</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            As regras que decidem quem entra no plano do dia.{' '}
            {!canEdit && 'Você tem acesso de leitura — mudanças são do admin.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowHistory((v) => !v)}>
            <History size={14} strokeWidth={1.5} aria-hidden />
            Histórico
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={!dirty || save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar mudanças'}
            </Button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Mudanças recentes</h3>
          {history.isLoading ? (
            <Spinner className="my-3" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Nenhuma mudança registrada — tudo no padrão.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
              {(history.data ?? []).slice(0, 30).map((h, i) => (
                <li key={i}>
                  <code>{h.key}</code>
                  {h.segment && ` (${h.segment})`} → <b className="text-[var(--text-primary)]">{String(h.value)}</b> ·{' '}
                  {h.changedBy ?? 'sistema'} em {new Date(h.changedAt).toLocaleString('pt-BR')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {BLOCKS.map((block) => (
        <section key={block.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{block.title}</h2>
          <p className="text-xs text-[var(--text-secondary)]">{block.subtitle}</p>
          {block.title === 'Pesos do ranking' && (
            <p className={`mt-1 text-xs font-medium ${weightsOk ? 'text-success' : 'text-danger'}`}>
              Soma atual: {sum} {weightsOk ? '✓' : '(precisa ser 100)'}
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {block.params.map((meta) => {
              const row = rowByKey.get(meta.key)
              const value = values[meta.key]
              const defaultValue = DEFAULT_INTEL_PARAMETERS[meta.key]
              const isDefault = value === defaultValue
              const hint = [
                meta.hint,
                isDefault ? 'padrão' : `padrão: ${String(defaultValue)}`,
                row?.changedBy && !row.isDefault
                  ? `por ${row.changedBy}${row.updatedAt ? ` em ${new Date(row.updatedAt).toLocaleDateString('pt-BR')}` : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')

              if (meta.kind === 'switch') {
                return (
                  <div key={meta.key} className="flex flex-col gap-1">
                    <Switch
                      checked={value === true}
                      onChange={(checked) => setValue(meta.key, checked)}
                      label={meta.label}
                      disabled={!canEdit}
                    />
                    <span className="text-xs text-[var(--text-secondary)]">{hint}</span>
                  </div>
                )
              }
              if (meta.kind === 'select') {
                return (
                  <div key={meta.key}>
                    <FormSelect
                      label={meta.label}
                      value={String(value ?? '')}
                      onChange={(e) => setValue(meta.key, e.target.value)}
                      disabled={!canEdit}
                    >
                      {meta.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </FormSelect>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
                  </div>
                )
              }
              const isWeight = (WEIGHT_KEYS as readonly string[]).includes(meta.key)
              return (
                <FormField
                  key={meta.key}
                  label={meta.label}
                  type="number"
                  step={meta.step}
                  value={String(value ?? '')}
                  onChange={(e) => {
                    const n = e.target.value === '' ? '' : Number(e.target.value)
                    setValue(meta.key, n)
                  }}
                  disabled={!canEdit}
                  hint={hint}
                  error={isWeight && !weightsOk ? ' ' : undefined}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
