'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, getApiErrorMessage } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField, FormSelect } from '@/components/ui/FormField'

interface Company {
  id: string
  name: string
  cnpj: string
  active: boolean
}

const schema = z.object({
  clientName: z.string().min(1, 'Nome obrigatório').max(200),
  companyId: z.string().uuid('Selecione uma empresa'),
  startDate: z.string().min(1, 'Data de início obrigatória'),
  endDate: z.string().min(1, 'Data de fim obrigatória'),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
  message: 'Data de fim deve ser posterior ao início',
  path: ['endDate'],
})

type FormData = z.infer<typeof schema>

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function CreatePilotModal({ onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    },
  })

  useEffect(() => {
    api.get<Company[]>('/companies').then((r) => {
      setCompanies(r.data.filter((c) => c.active))
    })
  }, [])

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)
    try {
      await api.post('/admin/pilots', {
        clientName: data.clientName,
        companyId: data.companyId,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate + 'T23:59:59').toISOString(),
      })
      onCreated()
      onClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Erro ao criar piloto'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Novo piloto">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          label="Nome do cliente"
          placeholder="Ex: Distribuidora São Paulo Ltda"
          error={errors.clientName?.message}
          {...register('clientName')}
        />

        <FormSelect label="Empresa (tenant)" error={errors.companyId?.message} {...register('companyId')}>
          <option value="">Selecione a empresa...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.cnpj}
            </option>
          ))}
        </FormSelect>

        <div className="grid grid-cols-2 gap-3">
          <FormField type="date" label="Início" error={errors.startDate?.message} {...register('startDate')} />
          <FormField type="date" label="Fim (30 dias)" error={errors.endDate?.message} {...register('endDate')} />
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" loading={loading} className="flex-1">
            Criar piloto
          </Button>
        </div>
      </form>
    </Modal>
  )
}
