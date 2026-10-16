'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import {
  contractFieldLabel,
  formatYmd,
  type ClientDetailDto,
  type ClientDocumentsDto,
  type ContractDocumentSummaryDto,
} from '@addere/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, FormSelect } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ContractMarkdown } from '@/components/contracts/ContractMarkdown'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import {
  DOCUMENT_KIND_SHORT,
  DOCUMENT_STATUS_BADGE,
  DOCUMENT_STATUS_LABELS,
  formatDateTimeBrasilia,
} from '@/lib/contract-ui'
import {
  useCancelDocument,
  useClientDocuments,
  useDocumentPreview,
  useResendDocument,
  useSendDocument,
  useSetDesignatedAdmin,
} from '@/hooks/useContracts'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'

function sendErrorMessage(err: unknown): string {
  const code = getApiErrorCode(err)
  const message = getApiErrorMessage(err, 'Erro ao enviar o documento.')
  if (code === 'CONTRACT_FIELDS_MISSING') {
    const missing =
      (err as { response?: { data?: { details?: { missing?: string[] } } } }).response?.data
        ?.details?.missing ?? []
    return `${message}: ${missing.map(contractFieldLabel).join('; ')}`
  }
  if (code === 'DESIGNATED_ADMIN_REQUIRED') {
    return 'Escolha o administrador indicado pela Empresa antes de enviar.'
  }
  // DESIGNATED_ADMIN_INVALID, TEMPLATE_NOT_PUBLISHED, AMENDMENT_NOTICE_TOO_SHORT
  // (com a data mínima) e DOCUMENT_ALREADY_SENT: a mensagem da API já diz o que fazer
  return message
}

// ─── Administrador indicado ──────────────────────────────────────────────────

function DesignatedAdminSelect({
  companyId,
  docs,
  hasSentDocument,
}: {
  companyId: string
  docs: ClientDocumentsDto
  hasSentDocument: boolean
}) {
  const setDesignee = useSetDesignatedAdmin(companyId)
  const [pending, setPending] = useState<string | null>(null)
  const current = docs.designatedAdmin
  const candidates = docs.adminCandidates
  const invalid = current !== null && !current.valid

  async function apply(userId: string) {
    try {
      const result = await setDesignee.mutateAsync(userId)
      toast.success(
        result.cancelledDocuments > 0
          ? 'Administrador indicado trocado. O documento enviado foi cancelado: envie de novo.'
          : 'Administrador indicado salvo.'
      )
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao trocar o administrador indicado.'))
    }
  }

  function onChange(userId: string) {
    if (!userId || userId === current?.id) return
    if (hasSentDocument) setPending(userId)
    else void apply(userId)
  }

  return (
    <div className="space-y-1.5">
      {candidates.length === 0 && !current ? (
        <p className="text-sm text-warning">
          Nenhum administrador ativo nesta empresa. Crie, em Usuários, o administrador indicado pela
          Empresa (só por indicação dela).
        </p>
      ) : (
        <FormSelect
          label="Administrador indicado pela Empresa"
          value={current?.id ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={setDesignee.isPending}
          error={
            invalid
              ? `${current.name} não é mais administrador ativo desta empresa. Escolha outro indicado.`
              : undefined
          }
        >
          {!current && <option value="">Escolha o administrador</option>}
          {invalid && <option value={current.id}>{current.name} (inativo)</option>}
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.email}
            </option>
          ))}
        </FormSelect>
      )}
      <p className="text-xs text-[var(--text-muted)]">
        Só ele aceita o contrato e os aditivos e pede licenças.
        {hasSentDocument && ' Trocar com um documento enviado cancela o documento.'}
      </p>

      <Modal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title="Trocar o administrador indicado?"
        className="max-w-md"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Trocar o administrador indicado cancela o documento enviado; será preciso enviar de novo.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setPending(null)}>
            Voltar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const userId = pending
              setPending(null)
              if (userId) void apply(userId)
            }}
          >
            Trocar e cancelar o envio
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Linha do tempo ──────────────────────────────────────────────────────────

function TimelineItem({ doc }: { doc: ContractDocumentSummaryDto }) {
  const resend = useResendDocument()
  const cancel = useCancelDocument()
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  async function handleResend() {
    try {
      const { emailSent } = await resend.mutateAsync(doc.id)
      if (emailSent) toast.success('E-mail reenviado ao administrador indicado.')
      else toast.error('O e-mail não saiu. Confira a configuração de e-mail e tente de novo.')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao reenviar o e-mail.'))
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync({ id: doc.id, reason: reason.trim() || null })
      setCancelling(false)
      toast.success('Envio cancelado.')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao cancelar o envio.'))
    }
  }

  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">
          {DOCUMENT_KIND_SHORT[doc.kind]}
        </span>
        <span className="text-[var(--text-muted)]">· modelo v{doc.templateVersion}</span>
        {doc.conditionsVersion !== null && doc.kind === 'AMENDMENT' && (
          <span className="text-[var(--text-muted)]">· condições v{doc.conditionsVersion}</span>
        )}
        <Badge variant={DOCUMENT_STATUS_BADGE[doc.status]}>
          {DOCUMENT_STATUS_LABELS[doc.status]}
        </Badge>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Enviado em {formatDateTimeBrasilia(doc.sentAt)}
        {doc.sentByName && ` por ${doc.sentByName}`}
        {doc.lastEmailAt
          ? ` · último e-mail ao indicado em ${formatDateTimeBrasilia(doc.lastEmailAt)}`
          : doc.status === 'SENT'
            ? ' · o e-mail ainda não saiu'
            : ''}
      </p>
      {doc.status === 'ACCEPTED' && doc.acceptedAt && (
        <p className="text-xs text-[var(--text-secondary)]">
          Aceito em {formatDateTimeBrasilia(doc.acceptedAt)} por {doc.acceptedByName} (
          {doc.acceptedByEmail}) · IP {doc.acceptedIp ?? '—'} · SHA-256{' '}
          <span className="font-mono">{doc.sha256.slice(0, 12)}…</span>
        </p>
      )}
      {doc.status === 'CANCELLED' && doc.cancelledAt && (
        <p className="text-xs text-[var(--text-secondary)]">
          Cancelado em {formatDateTimeBrasilia(doc.cancelledAt)}
          {doc.cancelReason && ` (${doc.cancelReason})`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {doc.status === 'SENT' && (
          <>
            <Button size="xs" variant="outline" onClick={handleResend} loading={resend.isPending}>
              Reenviar e-mail
            </Button>
            <Button size="xs" variant="danger-outline" onClick={() => setCancelling(true)}>
              Cancelar envio
            </Button>
          </>
        )}
        <a
          href={`/contrato/${doc.id}/imprimir`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]"
        >
          Imprimir <ExternalLink size={12} aria-hidden />
        </a>
      </div>

      <Modal
        isOpen={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancelar o envio?"
        className="max-w-md"
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            O documento deixa de poder ser aceito.
            {doc.kind === 'CONTRACT' && ' O contrato volta a rascunho.'}
          </p>
          <FormField
            label="Motivo (opcional)"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Voltar
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={cancel.isPending}>
              Cancelar envio
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  )
}

// ─── Documentos ──────────────────────────────────────────────────────────────

/**
 * Bloco Documentos da aba Contrato (plano 014): o administrador indicado, a
 * prévia e o envio do que estiver pendente (o contrato em rascunho ou o aditivo
 * proposto) e a linha do tempo.
 */
export function DocumentsPanel({
  client,
  carryConditions,
}: {
  client: ClientDetailDto
  carryConditions: boolean
}) {
  const companyId = client.company.id
  const contract = client.contract
  const { data: docs, isLoading, error } = useClientDocuments(companyId)
  const send = useSendDocument(companyId)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  const sent = docs?.documents.find((d) => d.status === 'SENT') ?? null
  const draftReady =
    contract?.status === 'DRAFT' &&
    contract.terms.some((t) => t.status === 'PROPOSED' && t.origin === 'CONTRACT')
  const amendmentReady = contract?.status === 'ACTIVE' && !!docs?.amendment
  const canSend = !sent && (draftReady || amendmentReady)
  const preview = useDocumentPreview(companyId, carryConditions, canSend && !!docs)

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  }
  if (error || !docs) {
    return (
      <p className="text-sm text-danger">
        {getApiErrorMessage(error, 'Erro ao carregar os documentos do contrato.')}
      </p>
    )
  }

  const missing = preview.data?.missing ?? []
  const designee = docs.designatedAdmin
  const kindLabel = amendmentReady ? 'aditivo' : 'contrato'

  async function handleSend() {
    setConfirmSend(false)
    try {
      const result = await send.mutateAsync({ carryConditions })
      if (result.emailSent) toast.success(`Documento enviado. E-mail enviado a ${designee?.name}.`)
      else
        toast.warning(
          'Documento enviado, mas o e-mail não saiu: use "Reenviar e-mail" na linha do tempo.'
        )
    } catch (err) {
      toast.error(sendErrorMessage(err))
    }
  }

  return (
    <Card className="space-y-5 p-4 sm:p-6">
      <p className={SECTION_TITLE}>Documentos</p>

      {contract && contract.status !== 'CANCELLED' && (
        <DesignatedAdminSelect companyId={companyId} docs={docs} hasSentDocument={!!sent} />
      )}

      <p className="text-sm text-[var(--text-secondary)]">
        Condições gerais aceitas:{' '}
        <span className="font-medium text-[var(--text-primary)]">
          {docs.conditions.acceptedVersion !== null ? `v${docs.conditions.acceptedVersion}` : '—'}
        </span>{' '}
        · publicada mais recente:{' '}
        <span className="font-medium text-[var(--text-primary)]">
          {docs.conditions.latestPublishedVersion !== null
            ? `v${docs.conditions.latestPublishedVersion}`
            : 'nenhuma'}
        </span>
      </p>

      {canSend && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreview(true)}
              disabled={!preview.data}
              loading={preview.isFetching}
            >
              Pré-visualizar documento
            </Button>
            <Button
              onClick={() => setConfirmSend(true)}
              disabled={!preview.data || missing.length > 0 || send.isPending}
              loading={send.isPending}
            >
              Enviar para aceite
            </Button>
          </div>
          {preview.error && (
            <p className="text-sm text-danger">
              {getApiErrorMessage(preview.error, 'Não foi possível montar o documento.')}
            </p>
          )}
          {missing.length > 0 && (
            <p className="text-sm text-warning">
              Falta preencher: {missing.map(contractFieldLabel).join('; ')}.
            </p>
          )}
          {preview.data?.minimumEffectiveFrom && (
            <p className="text-xs text-[var(--text-muted)]">
              Este aditivo exige &quot;vale a partir de&quot; a partir de{' '}
              {formatYmd(preview.data.minimumEffectiveFrom)}.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className={SECTION_TITLE}>Linha do tempo</p>
        {docs.documents.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nenhum documento enviado ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {docs.documents.map((d) => (
              <TimelineItem key={d.id} doc={d} />
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={showPreview && !!preview.data}
        onClose={() => setShowPreview(false)}
        title={`Prévia do ${kindLabel} · modelo v${preview.data?.templateVersion ?? ''}`}
        className="max-w-3xl"
      >
        {missing.length > 0 && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-[var(--text-primary)]">
            <p className="font-medium">Campos sem dado</p>
            <ul className="mt-1 list-disc pl-5 text-[var(--text-secondary)]">
              {missing.map((key) => (
                <li key={key}>{contractFieldLabel(key)}</li>
              ))}
            </ul>
          </div>
        )}
        {preview.data && <ContractMarkdown markdown={preview.data.renderedBody} />}
      </Modal>

      <Modal
        isOpen={confirmSend}
        onClose={() => setConfirmSend(false)}
        title={`Enviar o ${kindLabel} para aceite?`}
        className="max-w-md"
      >
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <p>
            {designee
              ? `O e-mail vai só para ${designee.name}, o administrador indicado. Só ele aceita.`
              : 'Escolha o administrador indicado pela Empresa antes de enviar.'}
          </p>
          {docs.activePilot && (
            <p className="text-warning">
              Esta empresa tem um piloto ativo. Empresa em piloto fica sem contrato: encerre o
              piloto antes, se for o caso.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSend(false)}>
              Voltar
            </Button>
            <Button onClick={handleSend} disabled={!designee}>
              Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
