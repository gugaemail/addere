'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { ClientDetailDto } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatCEPDisplay, formatDocumentDisplay, formatPhoneDisplay } from '@/lib/utils'
import { ClientFormModal } from '../../ClientFormModal'

const SECTION_TITLE = 'text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[var(--text-primary)]">{value || '—'}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className={SECTION_TITLE}>{title}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

// Cadastro comercial, só leitura. Editar abre o mesmo modal do "Novo cliente".
export function CadastroTab({ client }: { client: ClientDetailDto }) {
  const [editing, setEditing] = useState(false)
  const { company, profile: p } = client

  return (
    <>
      {p ? (
        <Card className="space-y-5 p-4 sm:p-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" leftIcon={Pencil} onClick={() => setEditing(true)}>
              Editar cadastro
            </Button>
          </div>

          <Section title="Empresa">
            <Field label="Nome no sistema" value={company.name} />
            <Field label="CNPJ" value={company.cnpj} />
            <Field label="Código Protheus" value={company.idProtheus} />
            <Field label="Inscrição estadual" value={p.stateRegistration} />
            <Field label="Razão social" value={p.legalName} />
            <Field label="Nome fantasia" value={p.tradeName} />
          </Section>

          <Section title="Endereço">
            <Field label="Logradouro" value={p.addressStreet} />
            <Field label="Número" value={p.addressNumber} />
            <Field label="Complemento" value={p.addressComplement} />
            <Field label="Bairro" value={p.addressDistrict} />
            <Field label="Cidade" value={p.addressCity} />
            <Field label="UF" value={p.addressState} />
            <Field label="CEP" value={formatCEPDisplay(p.addressZip)} />
          </Section>

          <Section title="Representante legal (vai no contrato)">
            <Field label="Nome" value={p.legalRepName} />
            <Field label="CPF" value={formatDocumentDisplay(p.legalRepCpf)} />
            <Field label="Cargo" value={p.legalRepRole} />
          </Section>

          <Section title="Contato principal">
            <Field label="Nome" value={p.contactName} />
            <Field label="E-mail" value={p.contactEmail} />
            <Field label="Telefone" value={formatPhoneDisplay(p.contactPhone)} />
          </Section>

          <Section title="Cobrança (recebe as faturas)">
            <Field label="Nome" value={p.billingContactName} />
            <Field label="E-mail" value={p.billingEmail} />
            <Field label="Telefone" value={formatPhoneDisplay(p.billingPhone)} />
          </Section>

          <section className="space-y-2">
            <p className={SECTION_TITLE}>Observações (só a Addere vê)</p>
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
              {p.notes || '—'}
            </p>
          </section>
        </Card>
      ) : (
        // Empresa criada antes do cadastro comercial (plano 013)
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-semibold text-[var(--text-primary)]">
            Cadastro comercial não preenchido
          </p>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Razão social, endereço, representante legal e contatos entram no contrato e nas faturas.
          </p>
          <Button leftIcon={Pencil} onClick={() => setEditing(true)}>
            Preencher cadastro
          </Button>
        </Card>
      )}

      {editing && <ClientFormModal mode="edit" client={client} onClose={() => setEditing(false)} />}
    </>
  )
}
