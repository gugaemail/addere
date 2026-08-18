'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { useCreateCompany } from '@/hooks/useCompanies'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function CreateCompanyModal({ onClose, onCreated }: Props) {
  const createCompany = useCreateCompany()
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [idProtheus, setIdProtheus] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createCompany.mutateAsync({ name, cnpj, idProtheus: idProtheus || undefined })
      onCreated()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Erro ao criar empresa.'))
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Nova Empresa">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormField label="CNPJ" required value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
        <FormField label="Código Protheus" value={idProtheus} onChange={(e) => setIdProtheus(e.target.value)} placeholder="Opcional" />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={createCompany.isPending} className="flex-1">
            Criar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
