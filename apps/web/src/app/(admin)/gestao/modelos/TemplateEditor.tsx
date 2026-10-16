'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  CONTRACT_FIELDS,
  CONTRACT_FIELD_GROUP_LABELS,
  SAMPLE_CONTRACT_VALUES,
  checkTemplateForPublish,
  contractFieldLabel,
  fillContractTemplate,
  normalizeTemplateBody,
  type ContractFieldGroup,
  type ContractTemplateDto,
  type TemplateIssue,
  type TemplatePreviewDto,
} from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ContractMarkdown } from '@/components/contracts/ContractMarkdown'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import {
  DOCUMENT_KIND_SHORT,
  TEMPLATE_ISSUE_LABELS,
  TEMPLATE_STATUS_BADGE,
  TEMPLATE_STATUS_LABELS,
} from '@/lib/contract-ui'
import { useClients } from '@/hooks/useBilling'
import { usePublishTemplate, useTemplatePreview, useUpdateTemplate } from '@/hooks/useContracts'

const SECTION_TITLE = 'text-sm font-semibold text-[var(--text-primary)]'

function issuesFromError(err: unknown): TemplateIssue[] | null {
  if (getApiErrorCode(err) !== 'TEMPLATE_NOT_PUBLISHABLE') return null
  const details = (err as { response?: { data?: { details?: { issues?: TemplateIssue[] } } } })
    .response?.data?.details
  return details?.issues ?? null
}

// Editor de uma versão do modelo (plano 014). A prévia ao vivo roda no
// navegador com os dados de exemplo; "Prévia com dados de" pede à API o texto
// salvo preenchido com os dados reais de uma empresa.
export function TemplateEditor({ template }: { template: ContractTemplateDto }) {
  const editable = template.status === 'DRAFT'
  const [body, setBody] = useState(template.body)
  const [changeNote, setChangeNote] = useState(template.changeNote ?? '')
  const [previewCompanyId, setPreviewCompanyId] = useState('')
  const [companyPreview, setCompanyPreview] = useState<TemplatePreviewDto | null>(null)
  const [serverIssues, setServerIssues] = useState<TemplateIssue[] | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const update = useUpdateTemplate()
  const publish = usePublishTemplate()
  const preview = useTemplatePreview()
  const { data: clients = [] } = useClients()

  const dirty =
    normalizeTemplateBody(body) !== normalizeTemplateBody(template.body) ||
    (changeNote.trim() || null) !== (template.changeNote ?? null)
  const issues = useMemo(() => checkTemplateForPublish(template.kind, body), [template.kind, body])
  const samplePreview = useMemo(
    () => fillContractTemplate(body, SAMPLE_CONTRACT_VALUES).text,
    [body]
  )

  const groups = useMemo(() => {
    const byGroup = new Map<ContractFieldGroup, (typeof CONTRACT_FIELDS)[number][]>()
    for (const field of CONTRACT_FIELDS) {
      if (!(field.kinds as readonly string[]).includes(template.kind)) continue
      byGroup.set(field.group, [...(byGroup.get(field.group) ?? []), field])
    }
    return [...byGroup.entries()]
  }, [template.kind])

  function insertField(key: string) {
    if (!editable) return
    const marker = `{{${key}}}`
    const el = textareaRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const next = body.slice(0, start) + marker + body.slice(end)
    setBody(next)
    // Devolve o cursor para logo depois do campo inserido
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + marker.length, start + marker.length)
    })
  }

  async function handleSave() {
    try {
      await update.mutateAsync({ id: template.id, body, changeNote: changeNote.trim() || null })
      setCompanyPreview(null)
      toast.success('Rascunho salvo')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar o rascunho'))
    }
  }

  async function handlePublish() {
    try {
      await publish.mutateAsync(template.id)
      setServerIssues(null)
      toast.success(`${DOCUMENT_KIND_SHORT[template.kind]} v${template.version} publicado`)
    } catch (err) {
      const fromApi = issuesFromError(err)
      if (fromApi) setServerIssues(fromApi)
      toast.error(getApiErrorMessage(err, 'Erro ao publicar o modelo'))
    }
  }

  async function handleCompanyPreview(companyId: string) {
    setPreviewCompanyId(companyId)
    setCompanyPreview(null)
    if (!companyId) return
    try {
      setCompanyPreview(await preview.mutateAsync({ id: template.id, companyId }))
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao montar a prévia'))
    }
  }

  const shownIssues = serverIssues ?? issues

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={SECTION_TITLE}>
          {editable ? 'Editor' : 'Texto'} · v{template.version}
        </h2>
        <Badge variant={TEMPLATE_STATUS_BADGE[template.status]}>
          {TEMPLATE_STATUS_LABELS[template.status]}
        </Badge>
        {!editable && (
          <span className="text-xs text-[var(--text-muted)]">
            Publicado ou arquivado não se edita: crie uma versão nova.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Textarea
          ref={textareaRef}
          mono
          value={body}
          onChange={(e) => setBody(e.target.value)}
          readOnly={!editable}
          aria-label="Texto do modelo"
          className="min-h-[32rem]"
        />
        <Card className="min-h-[32rem] overflow-y-auto">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {companyPreview
              ? 'Prévia com os dados da empresa (texto salvo)'
              : 'Prévia · dados de exemplo'}
          </p>
          <ContractMarkdown
            markdown={companyPreview ? companyPreview.renderedBody : samplePreview}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FormSelect
          label="Prévia com dados de"
          value={previewCompanyId}
          onChange={(e) => handleCompanyPreview(e.target.value)}
          disabled={preview.isPending}
        >
          <option value="">exemplo</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legalName ?? c.name}
            </option>
          ))}
        </FormSelect>
        {editable && (
          <FormField
            label="Nota da versão"
            value={changeNote}
            maxLength={500}
            onChange={(e) => setChangeNote(e.target.value)}
            hint="O que mudou nesta versão (aparece na lista de versões)"
          />
        )}
      </div>

      {companyPreview && companyPreview.missing.length > 0 && (
        <Card>
          <h3 className={SECTION_TITLE}>Campos sem dado nesta empresa</h3>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
            {companyPreview.missing.map((key) => (
              <li key={key}>{contractFieldLabel(key)}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h3 className={SECTION_TITLE}>Campos {editable && '— clique para inserir no cursor'}</h3>
        <div className="mt-3 space-y-3">
          {groups.map(([group, fields]) => (
            <div key={group}>
              <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
                {CONTRACT_FIELD_GROUP_LABELS[group]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {fields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => insertField(f.key)}
                    disabled={!editable}
                    title={`{{${f.key}}}`}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-brand hover:text-brand disabled:cursor-default disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-secondary)]"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className={SECTION_TITLE}>O que impede publicar</h3>
        {shownIssues.length === 0 ? (
          <p className="mt-2 text-sm text-success">Nada: o modelo pode ser publicado.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {shownIssues.map((issue, i) => (
              <li key={`${issue.line}-${i}`} className="flex gap-2 text-[var(--text-secondary)]">
                <span className="shrink-0 font-medium text-danger">linha {issue.line}</span>
                <span className="shrink-0 text-[var(--text-muted)]">
                  {TEMPLATE_ISSUE_LABELS[issue.type]}
                </span>
                <span className="min-w-0 break-words font-mono text-xs leading-5">
                  {issue.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!dirty}
            loading={update.isPending}
          >
            Salvar rascunho
          </Button>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="text-xs text-[var(--text-muted)]">Salve antes de publicar.</span>
            )}
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={dirty || issues.length > 0 || publish.isPending}
            >
              Publicar
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={`Publicar ${DOCUMENT_KIND_SHORT[template.kind].toLowerCase()} v${template.version}?`}
        className="max-w-md"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          A versão publicada passa a ser usada nos próximos envios, e a anterior é arquivada. Os
          documentos já enviados ou aceitos não mudam. Publique só depois do OK do advogado.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setConfirmPublish(false)}>
            Voltar
          </Button>
          <Button
            onClick={() => {
              setConfirmPublish(false)
              void handlePublish()
            }}
          >
            Publicar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
