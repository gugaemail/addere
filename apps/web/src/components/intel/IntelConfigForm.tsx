'use client'

// Formulário da configuração da Inteligência por empresa: horários do sync,
// tom das mensagens, retenção e aceite do aviso LGPD (§2.13). Um só formulário
// para dois lugares — a aba Inteligência de Empresas (SUPERADMIN,
// `companyIdOverride`) e /configuracoes (ADMIN, tenant do contexto) — para as
// regras de validação nunca divergirem.
//
// Liga/desliga (plano 014): a Inteligência entra pelo contrato. O Switch só
// aparece quando a API diz `canToggle` (SUPERADMIN, empresa sem contrato
// ativo); nos outros casos vira status só de leitura.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ShieldCheck } from 'lucide-react'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { useIntelConfig, useSaveIntelConfig } from '@/hooks/useIntel'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Switch } from '@/components/ui/Switch'
import { FormField, FormSelect } from '@/components/ui/FormField'

export const RETENTION_MIN_DAYS = 30
export const RETENTION_MAX_DAYS = 3650

interface IntelConfigFormProps {
  /** Empresa fora do CompanyContext (aba de Empresas). Sem ele vale o tenant ativo. */
  companyIdOverride?: string
  /** false mostra o aviso de que falta o endpoint SQL — só a aba de Empresas sabe disso. */
  apiSqlConfigured?: boolean
}

export function IntelConfigForm({ companyIdOverride, apiSqlConfigured = true }: IntelConfigFormProps) {
  const { data, isLoading } = useIntelConfig(companyIdOverride)
  const save = useSaveIntelConfig(companyIdOverride)
  const { isSuperAdmin } = useAuth()
  const { companyId: contextCompanyId } = useCompanyContext()
  const companyId = companyIdOverride ?? contextCompanyId

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
    if (!Number.isInteger(hour) || hour < 0 || hour > 23)
      return toast.error('Hora do sync deve estar entre 0 e 23')
    if (!Number.isInteger(every) || every < 1 || every > 24)
      return toast.error('Refresh deve estar entre 1 e 24 horas')
    if (!Number.isInteger(retention) || retention < RETENTION_MIN_DAYS || retention > RETENTION_MAX_DAYS)
      return toast.error(`Retenção entre ${RETENTION_MIN_DAYS} e ${RETENTION_MAX_DAYS} dias`)
    try {
      await save.mutateAsync({
        // Só quem pode ligar à mão manda o flag; nos outros casos o contrato decide
        ...(data?.canToggle ? { intelligenceEnabled: enabled } : {}),
        config: {
          syncHour: hour,
          syncEveryHours: every,
          defaultTone,
          retentionDays: retention,
          ...extra,
        },
      })
      setSeeded(false) // re-semeia do servidor
      toast.success(
        extra?.lgpdNoticeAcceptedAt ? 'Aceite registrado' : 'Configuração da Inteligência salva'
      )
    } catch (err) {
      if (getApiErrorCode(err) === 'INTEL_MANAGED_BY_CONTRACT') {
        // O contrato passou a definir a Inteligência com a tela aberta
        setSeeded(false)
        toast.error(getApiErrorMessage(err, 'A Inteligência é definida pelo contrato.'))
        return
      }
      toast.error(getApiErrorMessage(err, 'Erro ao salvar configuração'))
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        {data.canToggle ? (
          <Switch
            checked={enabled}
            onChange={setEnabled}
            label="Camada de Inteligência ligada para esta empresa"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Camada de Inteligência
            </span>
            <Badge variant={data.intelligenceEnabled ? 'success' : 'neutral'}>
              {isSuperAdmin
                ? data.intelligenceEnabled
                  ? 'Incluída no contrato'
                  : 'Não incluída no contrato'
                : data.intelligenceEnabled
                  ? 'Incluída no seu plano'
                  : 'Não incluída no seu plano — fale com a Addere'}
            </Badge>
          </div>
        )}
        {!data.canToggle && (
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
            {isSuperAdmin ? (
              <>
                Definida pelo contrato.{' '}
                {companyId && (
                  <Link
                    href={`/gestao/clientes/${companyId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    Ver na Gestão Addere →
                  </Link>
                )}
              </>
            ) : (
              <>
                Definida pelo seu contrato.{' '}
                <Link href="/plano" className="font-medium text-brand hover:underline">
                  Ver plano →
                </Link>
              </>
            )}
          </p>
        )}
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
          Liga o sync noturno, o motor de sinais e o plano do dia no app dos vendedores.
          {!apiSqlConfigured && (
            <span className="mt-1 block font-medium text-warning">
              Falta cadastrar o endpoint &quot;SQL genérico (POST)&quot; na aba Protheus — sem ele o
              sync não roda.
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
          min={RETENTION_MIN_DAYS}
          max={RETENTION_MAX_DAYS}
          value={retentionDays}
          onChange={(e) => setRetentionDays(e.target.value)}
          hint={`Briefings e mensagens geradas — de ${RETENTION_MIN_DAYS} a ${RETENTION_MAX_DAYS}; padrão: 365`}
        />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldCheck size={15} strokeWidth={1.5} className="text-brand" aria-hidden />
          Aviso LGPD
        </h3>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--text-secondary)]">
          <li>
            Briefings e mensagens geradas ficam guardados por {retentionDays || '—'} dias e depois
            são apagados; o cache de textos do agente expira em 24 horas.
          </li>
          <li>Coordenadas de GPS das visitas são zeradas após 90 dias.</li>
          <li>
            Dados do ERP nunca vão para logs, e o agente só recebe dados pseudonimizados — nenhum
            dado identificável do cliente é enviado ao LLM.
          </li>
        </ul>
        {lgpdAccepted ? (
          <p className="mt-2 text-xs font-medium text-success">
            Aceite registrado em{' '}
            {new Date(lgpdAccepted).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => handleSave({ lgpdNoticeAcceptedAt: new Date().toISOString() })}
            disabled={save.isPending}
          >
            Registrar aceite
          </Button>
        )}
      </div>

      <Button onClick={() => handleSave()} disabled={save.isPending}>
        {save.isPending ? 'Salvando…' : 'Salvar configuração'}
      </Button>
    </div>
  )
}
