'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { usePermissionCatalog, useUserPermissions, useSetUserPermissions, useCopyUserPermissions } from '@/hooks/usePermissions'
import { useUsers } from '@/hooks/useUsers'
import type { UserPublic } from '@addere/types'

interface PermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  user: UserPublic | null
}

export function PermissionsModal({ isOpen, onClose, user }: PermissionsModalProps) {
  const { data: catalog, isLoading: loadingCatalog } = usePermissionCatalog()
  const { data: grantedKeys, isLoading: loadingGranted } = useUserPermissions(user?.id ?? null)
  const { data: users } = useUsers()
  const setPermissions = useSetUserPermissions(user?.id ?? '')
  const copyPermissions = useCopyUserPermissions(user?.id ?? '')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copyFromId, setCopyFromId] = useState('')

  useEffect(() => {
    setSelected(new Set(grantedKeys ?? []))
  }, [grantedKeys])

  if (!user) return null

  const categories = Array.from(new Set((catalog ?? []).map((p) => p.category)))

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave() {
    await setPermissions.mutateAsync(Array.from(selected))
    onClose()
  }

  async function handleCopy() {
    if (!copyFromId) return
    await copyPermissions.mutateAsync(copyFromId)
    setCopyFromId('')
  }

  const otherUsers = (users ?? []).filter((u) => u.id !== user.id)
  const isLoading = loadingCatalog || loadingGranted

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Permissões — ${user.name}`} className="max-w-lg">
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-300">Copiar permissões de</label>
              <select
                value={copyFromId}
                onChange={(e) => setCopyFromId(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Selecione um usuário</option>
                {otherUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={copyPermissions.isPending}
              disabled={!copyFromId}
              onClick={handleCopy}
            >
              Copiar
            </Button>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{category}</h3>
                <div className="space-y-2">
                  {(catalog ?? [])
                    .filter((p) => p.category === category)
                    .map((permission) => (
                      <label key={permission.key} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(permission.key)}
                          onChange={() => toggle(permission.key)}
                          className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                        />
                        {permission.label}
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {setPermissions.isError && (
            <p className="text-sm text-red-400">Erro ao salvar permissões.</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" loading={setPermissions.isPending} onClick={handleSave}>
              Salvar permissões
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
