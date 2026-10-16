'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ContractDocumentKind, ContractTemplateSummaryDto } from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import { getApiErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { TEMPLATE_STATUS_BADGE, TEMPLATE_STATUS_LABELS } from '@/lib/contract-ui'
import {
  useContractTemplate,
  useContractTemplates,
  useCreateTemplateVersion,
} from '@/hooks/useContracts'
import { TemplateEditor } from './TemplateEditor'

const TABS: { key: ContractDocumentKind; label: string }[] = [
  { key: 'CONTRACT', label: 'Contrato' },
  { key: 'AMENDMENT', label: 'Aditivo' },
]

function versionLine(t: ContractTemplateSummaryDto): string {
  if (t.status === 'DRAFT') {
    return `criado${t.createdByName ? ` por ${t.createdByName}` : ' pela migration'} em ${formatDate(t.createdAt)}`
  }
  const when = t.publishedAt ? formatDate(t.publishedAt) : formatDate(t.createdAt)
  return `publicado em ${when}${t.publishedByName ? ` por ${t.publishedByName}` : ''}`
}

/** A versão que a tela abre: o rascunho do tipo, senão o publicado, senão a maior */
function defaultSelection(list: ContractTemplateSummaryDto[]): string | null {
  return (
    list.find((t) => t.status === 'DRAFT')?.id ??
    list.find((t) => t.status === 'PUBLISHED')?.id ??
    list[0]?.id ??
    null
  )
}

// Gestão Addere › Modelos de contrato (plano 014). Texto versionado do contrato
// e do aditivo: um rascunho por tipo, publicado não se edita, e marca
// [[REVISAR]] impede publicar (a API recusa de novo).
export default function ModelosPage() {
  const [kind, setKind] = useState<ContractDocumentKind>('CONTRACT')
  const [selected, setSelected] = useState<Record<ContractDocumentKind, string | null>>({
    CONTRACT: null,
    AMENDMENT: null,
  })
  const { data: templates = [], isLoading, error, refetch } = useContractTemplates()
  const create = useCreateTemplateVersion()

  const versions = useMemo(() => templates.filter((t) => t.kind === kind), [templates, kind])
  const selectedId =
    selected[kind] && versions.some((v) => v.id === selected[kind])
      ? selected[kind]
      : defaultSelection(versions)
  const { data: template, isLoading: loadingTemplate } = useContractTemplate(selectedId)
  const hasDraft = versions.some((v) => v.status === 'DRAFT')

  async function newVersion(fromTemplateId?: string) {
    try {
      const created = await create.mutateAsync({ kind, fromTemplateId })
      setSelected((s) => ({ ...s, [kind]: created.id }))
      toast.success(`Versão v${created.version} criada em rascunho`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao criar a versão'))
    }
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    )

  if (error)
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="font-semibold text-danger">Erro ao carregar os modelos</p>
        <p className="text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(error, 'Erro ao carregar os modelos')}
        </p>
        <Button onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Modelos de contrato
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Condições gerais do Contrato de Licença de Uso e o modelo de aditivo. O quadro-resumo sai
          dos campos do cadastro e do contrato. Contrato e aditivo são publicados juntos, depois do
          OK do advogado.
        </p>
      </div>

      <Tabs tabs={TABS} active={kind} onChange={(key) => setKind(key as ContractDocumentKind)} />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Versões</h2>
          {!hasDraft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => newVersion()}
              loading={create.isPending}
            >
              Nova versão
            </Button>
          )}
        </div>
        {versions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nenhuma versão deste modelo.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">v{v.version}</span>
                  <Badge variant={TEMPLATE_STATUS_BADGE[v.status]}>
                    {TEMPLATE_STATUS_LABELS[v.status]}
                  </Badge>
                  <span className="text-[var(--text-muted)]">{versionLine(v)}</span>
                  {v.changeNote && (
                    <span className="w-full text-xs text-[var(--text-muted)]">{v.changeNote}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant={v.id === selectedId ? 'secondary' : 'outline'}
                    onClick={() => setSelected((s) => ({ ...s, [kind]: v.id }))}
                  >
                    {v.status === 'DRAFT' ? 'Editar' : 'Ver'}
                  </Button>
                  {v.status !== 'DRAFT' && !hasDraft && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => newVersion(v.id)}
                      disabled={create.isPending}
                    >
                      Nova versão a partir desta
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selectedId && loadingTemplate && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {/* key: trocar de versão recomeça o editor com o texto dela */}
      {template && template.id === selectedId && (
        <TemplateEditor key={`${template.id}-${template.updatedAt}`} template={template} />
      )}
    </div>
  )
}
