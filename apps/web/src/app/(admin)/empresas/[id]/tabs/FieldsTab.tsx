'use client'

import { useEffect, useState } from 'react'
import { FIELD_REGISTRY } from '@addere/types'
import { useCompanyFieldConfig, useSaveFieldConfig } from '@/hooks/useCompany'

const ENTITY_LABELS: Record<string, string> = {
  customer: 'Cliente', order: 'Pedido', orderItem: 'Item do Pedido', product: 'Produto',
}

export function FieldsTab({ companyId }: { companyId: string }) {
  const { data: fieldConfig } = useCompanyFieldConfig(companyId)
  const saveFieldConfig = useSaveFieldConfig(companyId)

  const [hiddenFields, setHiddenFields] = useState<string[]>([])
  const [requiredFields, setRequiredFields] = useState<string[]>([])

  // Sincroniza o estado local quando a config chega do servidor
  useEffect(() => {
    if (fieldConfig) {
      setHiddenFields(fieldConfig.hidden ?? [])
      setRequiredFields(fieldConfig.required ?? [])
    }
  }, [fieldConfig])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Visibilidade e obrigatoriedade de campos</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Controle quais campos aparecem no app e quais são obrigatórios nos formulários.
        </p>
      </div>

      {(['customer', 'order', 'orderItem', 'product'] as const).map((entity) => {
        const fields = FIELD_REGISTRY.filter((f) => f.entity === entity)
        return (
          <div key={entity} className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{ENTITY_LABELS[entity]}</h3>
              <div className="flex gap-6 pr-1">
                <span className="text-xs font-medium text-[var(--text-muted)] w-14 text-center">Visível</span>
                <span className="text-xs font-medium text-[var(--text-muted)] w-14 text-center">Obrigatório</span>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {fields.map((field) => {
                const isHidden   = hiddenFields.includes(field.key)
                const isRequired = requiredFields.includes(field.key)
                const canBeRequired = field.affectsInput && !isHidden
                return (
                  <div key={field.key} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{field.label}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {field.affectsInput ? 'Oculta exibição e formulário' : 'Oculta apenas exibição'}
                      </p>
                    </div>
                    <div className="flex gap-6 pr-1">
                      <div className="w-14 flex justify-center">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHiddenFields((prev) => prev.filter((k) => k !== field.key))
                            } else {
                              setHiddenFields((prev) => [...prev, field.key])
                              setRequiredFields((prev) => prev.filter((k) => k !== field.key))
                            }
                          }}
                          className="w-4 h-4 accent-brand-500 cursor-pointer"
                        />
                      </div>
                      <div className="w-14 flex justify-center">
                        {canBeRequired || isRequired ? (
                          <input
                            type="checkbox"
                            checked={isRequired}
                            disabled={!canBeRequired}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRequiredFields((prev) => [...prev, field.key])
                              } else {
                                setRequiredFields((prev) => prev.filter((k) => k !== field.key))
                              }
                            }}
                            className="w-4 h-4 accent-brand-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        ) : (
                          <span className="text-[var(--text-muted)] text-sm select-none">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-4">
        <button
          onClick={() => saveFieldConfig.mutate({ hidden: hiddenFields, required: requiredFields })}
          disabled={saveFieldConfig.isPending}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saveFieldConfig.isPending ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
