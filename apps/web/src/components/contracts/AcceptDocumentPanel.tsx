'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CONTRACT_DOCUMENT_KIND_LABELS,
  type ContractDocumentDto,
  type DesignatedAdminRef,
} from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'
import { useAcceptDocument } from '@/hooks/useContracts'
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api'
import { sha256Hex } from '@/lib/contract-hash'
import { pendingDocumentMode } from '@/lib/contract-acceptance'
import { formatDate } from '@/lib/utils'
import { ContractDocumentView } from './ContractDocumentView'

// Documento pendente (plano 014). Três modos (decisão 10): o administrador
// indicado lê e aceita; os outros ADMINs só leem; sem indicado válido,
// ninguém aceita. O texto fica inteiro na rolagem da página, sem caixa com
// rolagem própria.
//
// O hash é calculado aqui, sobre o texto que vai ser exibido, e comparado com
// o gravado antes de habilitar o "Aceitar"; o que vai para a API é o hash
// calculado no navegador (decisão de desenho 1).
export function AcceptDocumentPanel({
  doc,
  designatedAdmin,
  onChanged,
}: {
  doc: ContractDocumentDto
  designatedAdmin: DesignatedAdminRef | null
  /** Depois do aceite ou de um erro que muda a situação: recarregar as listas */
  onChanged?: () => void
}) {
  const { user, refreshUser } = useAuth()
  const accept = useAcceptDocument()
  const [agreed, setAgreed] = useState(false)
  const [localHash, setLocalHash] = useState<string | null>(null)
  const [hashFailed, setHashFailed] = useState(false)

  const mode = pendingDocumentMode(user?.id, designatedAdmin)
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  const hashOk = localHash !== null && localHash === doc.sha256

  useEffect(() => {
    let alive = true
    sha256Hex(doc.renderedBody)
      .then((hash) => {
        if (!alive) return
        setLocalHash(hash)
        setHashFailed(hash !== doc.sha256)
      })
      .catch(() => alive && setHashFailed(true))
    return () => {
      alive = false
    }
  }, [doc.renderedBody, doc.sha256])

  async function handleAccept() {
    if (!localHash || !hashOk) return
    try {
      await accept.mutateAsync({ id: doc.id, sha256: localHash })
      toast.success('Aceite registrado.')
      await refreshUser().catch(() => undefined)
      onChanged?.()
    } catch (err) {
      const code = getApiErrorCode(err)
      toast.error(getApiErrorMessage(err, 'Não foi possível registrar o aceite.'))
      // O documento foi aceito ou cancelado, o texto mudou ou o indicado mudou
      // com a página aberta: recarrega para mostrar a situação nova
      if (
        code === 'DOCUMENT_NOT_PENDING' ||
        code === 'DOCUMENT_HASH_MISMATCH' ||
        code === 'NOT_DESIGNATED_ADMIN'
      ) {
        await refreshUser().catch(() => undefined)
        onChanged?.()
      }
    }
  }

  const title =
    mode === 'accept'
      ? 'Aguardando seu aceite'
      : mode === 'readonly'
        ? `Aguardando o aceite de ${designatedAdmin?.name}`
        : 'Aguardando aceite'

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {label} · enviado em {formatDate(doc.sentAt)}
        </p>
      </div>

      {mode === 'designee-invalid' && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          {designatedAdmin
            ? `O administrador indicado (${designatedAdmin.name}) não está mais ativo. Fale com a Addere para indicar outro.`
            : 'O administrador indicado não está mais ativo. Fale com a Addere para indicar outro.'}
        </p>
      )}

      <ContractDocumentView doc={doc} />

      {mode === 'accept' && (
        <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-4">
          {hashFailed && (
            <p className="text-sm font-medium text-danger">
              Não foi possível conferir o texto. Recarregue a página.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--border)] accent-brand focus:ring-brand"
            />
            Li e concordo com o {label}
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Ao aceitar, registramos seu nome e e-mail, a data e a hora, o IP, o navegador e o código
            de integridade (SHA-256) deste texto.
          </p>
          <div className="flex justify-end">
            <Button
              onClick={handleAccept}
              disabled={!agreed || !hashOk || accept.isPending}
              loading={accept.isPending}
            >
              Aceitar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
