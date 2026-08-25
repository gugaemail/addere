'use client'

// Aba Inteligência da empresa (E10): liga/desliga a camada, horários do sync,
// tom das mensagens, retenção e aviso LGPD (§2.13).
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'
import { getApiErrorMessage } from '@/lib/api'
import { useIntelConfig, useSaveIntelConfig } from '@/hooks/useIntel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Switch } from '@/components/ui/Switch'
import { FormField, FormSelect } from '@/components/ui/FormField'

interface IntelligenceTabProps {
  companyId: string
  apiSqlConfigured: boolean
}

export function IntelligenceTab({ companyId, apiSqlConfigured }: IntelligenceTabProps) {
  const { data, isLoading } = useIntelConfig(companyId)
  const save = useSaveIntelConfig(companyId)

  const [enabled, setEnabled] = useState(false)
  const [syncHour, setSyncHour] = useState('3')
  const [syncEveryHours, setSyncEveryHours] = useState('4')
  const [defaultTone, setDefaultTone] = useState<'informal' | 'formal'>('informal')
  const [retentionDays, setRetentionDays] = useState('365')
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (!data || seeded) return
    setEnabled(data.intelligenceEnabled)
    setSyncHour(String(data.config.syncHour))
    setSyncEveryHours(String(data.config.syncEveryHours))
    setDefaultTone(data.config.defaultTone)
    setRetentionDays(String(data.config.retentionDays))
    setSeeded(true)
  }, [data, seeded])

  if (isLoading || !data || !seeded) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const lgpdAccepted = data.config.lgpdNoticeAcceptedAt

  async function handleSave(extra?: { lgpdNoticeAcceptedAt?: string }) {
    const hour = Number(syncHour)
    const every = Number(syncEveryHours)
    const retention = Number(retentionDays)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return toast.error('Hora do sync deve estar entre 0 e 23')
    if (!Number.isInteger(every) || every < 1 || every > 24) return toast.error('Refresh deve estar entre 1 e 24 horas')
    if (!Number.isInteger(retention) || retention < 30) return toast.error('Retenção mínima de 30 dias')
    try {
      await save.mutateAsync({
        intelligenceEnabled: enabled,
        config: {
          syncHour: hour,
          syncEveryHours: every,
          defaultTone,
          retentionDays: retention,
          ...extra,
        },
      })
      setSeeded(false)
      toast.success('Configuração da Inteligência salva')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar configuração'))
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="Camada de Inteligência ligada para esta empresa"
        />
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
          Liga o sync noturno, o motor de sinais e o plano do dia no app dos vendedores.
          {!apiSqlConfigured && (
            <span className="mt-1 block font-medium text-warning">
              Falta cadastrar o endpoint &quot;SQL genérico (POST)&quot; na aba Protheus — sem ele o sync não roda.
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Hora do sync noturno (BRT)"
          type="number"
          min={0}
          max={23}
          value={syncHour}
          onChange={(e) => setSyncHour(e.target.value)}
          hint="Padrão: 3h da manhã"
        />
        <FormField
          label="Refresh durante o dia (a cada X horas)"
          type="number"
          min={1}
          max={24}
          value={syncEveryHours}
          onChange={(e) => setSyncEveryHours(e.target.value)}
          hint="Vendas e títulos — padrão: 4h"
        />
        <FormSelect
          label="Tom padrão das mensagens"
          value={defaultTone}
          onChange={(e) => setDefaultTone(e.target.value as 'informal' | 'formal')}
        >
          <option value="informal">Informal (você)</option>
          <option value="formal">Formal (o senhor / a senhora)</option>
        </FormSelect>
        <FormField
          label="Retenção de textos (dias)"
          type="number"
          min={30}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
          hint="Briefings e mensagens geradas — padrão: 365"
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldCheck size={15} strokeWidth={1.5} className="text-brand" aria-hidden />
          Tratamento de dados (LGPD)
        </h3>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--text-secondary)]">
          <li>Cache de textos do agente expira em 24 horas</li>
          <li>Briefings e mensagens são apagados após o prazo de retenção acima</li>
          <li>Coordenadas de GPS das visitas são zeradas após 90 dias</li>
          <li>Nenhum dado identificável do cliente é enviado ao LLM (pseudonimização)</li>
        </ul>
        {lgpdAccepted ? (
          <p className="mt-2 text-xs font-medium text-success">
            Aviso aceito em {new Date(lgpdAccepted).toLocaleDateString('pt-BR')}
          </p>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => handleSave({ lgpdNoticeAcceptedAt: new Date().toISOString() })}
            disabled={save.isPending}
          >
            Marcar aviso como lido e aceito
          </Button>
        )}
      </div>

      <Button onClick={() => handleSave()} disabled={save.isPending}>
        {save.isPending ? 'Salvando…' : 'Salvar configuração'}
      </Button>
    </div>
  )
}
