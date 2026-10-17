'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { BillingSettingsDto, LicensePackageDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField } from '@/components/ui/FormField'
import { Spinner } from '@/components/ui/Spinner'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Switch } from '@/components/ui/Switch'
import { Table, type Column } from '@/components/ui/Table'
import { getApiErrorMessage } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { billingSettingsFormSchema, type BillingSettingsFormData } from '@/lib/schemas'
import {
  useBillingSettings,
  usePackages,
  useSetPackageActive,
  useUpdateBillingSettings,
} from '@/hooks/useBilling'
import { ConfirmModal } from '@/app/(admin)/empresas/[id]/ConfirmModal'
import { PackageFormModal } from './PackageFormModal'

const SECTION_TITLE = 'text-sm font-semibold text-[var(--text-primary)]'

const price = (v: string | null) => (v ? formatCurrency(v) : '—')

// Pacotes e regras da Gestão Addere (plano 013). O catálogo só pré-preenche o
// contrato; as regras valem quando o faturamento (plano 016) estiver ligado.
export default function PacotesPage() {
  const { data: packages = [], isLoading, error, refetch } = usePackages()
  const setActive = useSetPackageActive()
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; pkg?: LicensePackageDto } | null>(
    null
  )

  function toggleActive(pkg: LicensePackageDto) {
    setActive.mutate(
      { id: pkg.id, active: !pkg.active },
      {
        onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao alterar o pacote.')),
      }
    )
  }

  const columns: Column<LicensePackageDto>[] = [
    {
      key: 'code',
      header: 'Código',
      render: (p) => <span className="font-mono text-[var(--text-primary)]">{p.code}</span>,
    },
    { key: 'name', header: 'Nome', render: (p) => p.name },
    {
      key: 'seats',
      header: 'Licenças',
      className: 'whitespace-nowrap',
      render: (p) => p.seats ?? <span className="text-[var(--text-muted)]">no contrato</span>,
    },
    {
      key: 'standard',
      header: 'Padrão',
      className: 'whitespace-nowrap',
      render: (p) => price(p.listPriceStandard),
    },
    {
      key: 'intelligence',
      header: 'Com Inteligência',
      className: 'whitespace-nowrap',
      render: (p) => price(p.listPriceIntelligence),
    },
    {
      key: 'extra',
      header: 'Adicional',
      className: 'whitespace-nowrap',
      render: (p) =>
        `${price(p.listExtraSeatPriceStandard)} / ${price(p.listExtraSeatPriceIntelligence)}`,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'text-center',
      render: (p) => <StatusBadge active={p.active} />,
    },
    {
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Editar pacote"
            aria-label={`Editar ${p.name}`}
            leftIcon={Pencil}
            className="text-[var(--text-muted)] hover:text-brand"
            onClick={() => setModal({ mode: 'edit', pkg: p })}
          />
          <Button
            variant={p.active ? 'danger-outline' : 'success-outline'}
            size="xs"
            loading={setActive.isPending && setActive.variables?.id === p.id}
            onClick={() => toggleActive(p)}
          >
            {p.active ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
        Pacotes e regras
      </h1>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_TITLE}>Pacotes</h2>
          <Button leftIcon={Plus} onClick={() => setModal({ mode: 'create' })}>
            Novo pacote
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-card">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-danger">
                {getApiErrorMessage(error, 'Erro ao carregar os pacotes')}
              </p>
              <Button size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <Table
              columns={columns}
              data={packages}
              rowKey={(p) => p.id}
              className="rounded-none"
              emptyMessage="Nenhum pacote cadastrado."
              rowClassName={(p) => (p.active ? undefined : 'opacity-60')}
            />
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          O preço de tabela só pré-preenche o contrato; o valor é negociado com cada cliente.
        </p>
      </section>

      <BillingRulesSection />

      {modal && (
        <PackageFormModal mode={modal.mode} pkg={modal.pkg} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

// ─── Regras de cobrança ──────────────────────────────────────────────────────

const AUTO_BLOCK_TEXT =
  'Bloqueia o app e o painel de quem tem fatura vencida, sempre depois do aviso de 10 dias. Desligar libera os bloqueios por atraso no ciclo seguinte. Só ligue depois que a versão do app com a tela de acesso suspenso estiver no ar.'

// Plano 017: o switch do bloqueio automático. Nasce desligado (decisão 4) e é
// ligado só depois do OTA do app; desligar é o rollback. Salva sozinho, com os
// valores já gravados das outras regras (não os do formulário em edição), e
// sempre pede confirmação.
function AutoBlockSwitch({ settings }: { settings: BillingSettingsDto }) {
  const update = useUpdateBillingSettings()
  const [pending, setPending] = useState<boolean | null>(null)

  async function apply(autoBlockEnabled: boolean) {
    try {
      await update.mutateAsync({
        overdueBlockDays: settings.overdueBlockDays,
        dueReminderDays: settings.dueReminderDays,
        notifyEmail: settings.notifyEmail,
        autoBlockEnabled,
      })
      toast.success(
        autoBlockEnabled ? 'Bloqueio automático ligado.' : 'Bloqueio automático desligado.'
      )
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao alterar o bloqueio automático.'))
    }
  }

  return (
    <div className="sm:col-span-2">
      <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">Bloqueio automático</p>
      <Switch
        checked={settings.autoBlockEnabled}
        disabled={update.isPending}
        onChange={(next) => setPending(next)}
        label={settings.autoBlockEnabled ? 'Ligado' : 'Desligado'}
      />
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">{AUTO_BLOCK_TEXT}</p>
      {pending !== null && (
        <ConfirmModal
          title={pending ? 'Ligar o bloqueio automático' : 'Desligar o bloqueio automático'}
          description={
            pending
              ? 'A partir do próximo ciclo (até 1 hora), quem tiver fatura vencida com o aviso de suspensão enviado há 10 dias ou mais e a data prevista alcançada fica com o app e o painel bloqueados. Confirme que a versão do app com a tela de acesso suspenso já está no ar.'
              : 'No próximo ciclo (até 1 hora), todos os bloqueios por atraso são liberados, e nenhum bloqueio novo acontece até ligar de novo.'
          }
          confirmLabel={pending ? 'Ligar' : 'Desligar'}
          destructive={pending}
          onConfirm={() => void apply(pending)}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}

function BillingRulesSection() {
  const { data: settings, isLoading, error, refetch } = useBillingSettings()

  return (
    <section className="space-y-3">
      <h2 className={SECTION_TITLE}>Regras de cobrança</h2>
      <Card className="p-4 sm:p-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : error || !settings ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-danger">
              {getApiErrorMessage(error, 'Erro ao carregar as regras')}
            </p>
            <Button size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <BillingRulesForm settings={settings} />
        )}
      </Card>
    </section>
  )
}

function BillingRulesForm({ settings }: { settings: BillingSettingsDto }) {
  const update = useUpdateBillingSettings()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BillingSettingsFormData>({
    resolver: zodResolver(billingSettingsFormSchema),
    defaultValues: {
      overdueBlockDays: String(settings.overdueBlockDays),
      dueReminderDays: String(settings.dueReminderDays),
      notifyEmail: settings.notifyEmail ?? '',
    },
  })

  async function onSubmit(data: BillingSettingsFormData) {
    try {
      // Só os três campos do formulário: o bloqueio automático tem o switch
      // próprio (plano 017) e, sem a chave, a API mantém o valor gravado
      const saved = await update.mutateAsync({
        overdueBlockDays: Number(data.overdueBlockDays),
        dueReminderDays: Number(data.dueReminderDays),
        notifyEmail: data.notifyEmail?.trim() ? data.notifyEmail.trim() : null,
      })
      reset({
        overdueBlockDays: String(saved.overdueBlockDays),
        dueReminderDays: String(saved.dueReminderDays),
        notifyEmail: saved.notifyEmail ?? '',
      })
      toast.success('Regras salvas.')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar as regras.'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          label="Dias de atraso para suspender (padrão)"
          inputMode="numeric"
          hint="Vale quando o faturamento estiver ligado; cada contrato pode ter exceção."
          error={errors.overdueBlockDays?.message}
          {...register('overdueBlockDays')}
        />
        <FormField
          label="Lembrete antes do vencimento (dias)"
          inputMode="numeric"
          hint="O lembrete sai quando o faturamento estiver ligado."
          error={errors.dueReminderDays?.message}
          {...register('dueReminderDays')}
        />
        <FormField
          label="E-mail da Addere para os avisos"
          type="email"
          placeholder="Opcional"
          hint="Recebe os avisos de cobrança quando o faturamento estiver ligado."
          error={errors.notifyEmail?.message}
          {...register('notifyEmail')}
        />
        <AutoBlockSwitch settings={settings} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>
          Salvar regras
        </Button>
      </div>
    </form>
  )
}
