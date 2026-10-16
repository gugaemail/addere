'use client'

import type { ContractDocumentSummaryDto } from '@addere/types'
import { DOCUMENT_KIND_SHORT, formatDateTimeBrasilia } from '@/lib/contract-ui'

const ROW = 'grid grid-cols-1 gap-x-3 sm:grid-cols-[10rem_1fr]'
const KEY = 'text-[var(--text-muted)]'
const VALUE = 'min-w-0 break-words text-[var(--text-primary)]'

// Registro de aceite eletrônico (plano 014, contrato §14.2 e §14.4). Montado
// pelo sistema, fora do modelo, e impresso junto com o texto. Na impressão o
// bloco não se parte entre páginas (.acceptance-record em globals.css).
export function AcceptanceRecord({ doc }: { doc: ContractDocumentSummaryDto }) {
  const accepted = doc.status === 'ACCEPTED' && doc.acceptedAt
  return (
    <section className="acceptance-record mt-8 border-t border-[var(--border)] pt-4 text-sm">
      <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
        Registro de aceite eletrônico
      </h2>
      <dl className="space-y-1.5">
        {accepted ? (
          <>
            <div className={ROW}>
              <dt className={KEY}>Aceito por</dt>
              <dd className={VALUE}>
                {doc.acceptedByName} ({doc.acceptedByEmail})
              </dd>
            </div>
            <div className={ROW}>
              <dt className={KEY}>Em</dt>
              <dd className={VALUE}>
                {formatDateTimeBrasilia(doc.acceptedAt as string, true)} (horário de Brasília)
              </dd>
            </div>
            <div className={ROW}>
              <dt className={KEY}>IP</dt>
              <dd className={VALUE}>{doc.acceptedIp ?? '—'}</dd>
            </div>
            <div className={ROW}>
              <dt className={KEY}>Navegador</dt>
              <dd className={VALUE}>{doc.acceptedUserAgent ?? '—'}</dd>
            </div>
          </>
        ) : (
          <div className={ROW}>
            <dt className={KEY}>Situação</dt>
            <dd className={VALUE}>
              {doc.status === 'CANCELLED' ? 'Cancelado, sem aceite' : 'Aguardando aceite'}
            </dd>
          </div>
        )}
        <div className={ROW}>
          <dt className={KEY}>SHA-256 do texto</dt>
          <dd className={`${VALUE} font-mono text-xs leading-5`}>{doc.sha256}</dd>
        </div>
        <div className={ROW}>
          <dt className={KEY}>Documento</dt>
          <dd className={VALUE}>
            {DOCUMENT_KIND_SHORT[doc.kind]} · modelo v{doc.templateVersion} · id{' '}
            <span className="font-mono text-xs">{doc.id}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}
