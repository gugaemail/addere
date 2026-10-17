'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import type { CompanyAccessReason } from '@addere/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'

// Tela de acesso suspenso (plano 017), no lugar de toda rota do painel menos
// /plano e /contrato (ADMIN). O ADMIN vê o contrato e a cobrança (§6.6); o
// gerente só o aviso. "Verificar de novo" relê o /auth/me: liberada, a tela
// some sozinha.
export function CompanyBlockedScreen({
  reason,
  isAdmin,
}: {
  reason: CompanyAccessReason | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const { refreshUser } = useAuth()
  const [checking, setChecking] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)

  async function recheck() {
    setChecking(true)
    setStillBlocked(false)
    try {
      await refreshUser()
    } catch {
      // Sem rede ou API fora: a tela continua, e o botão pode ser tocado de novo
    } finally {
      setChecking(false)
      // Se continuar bloqueada, a tela continua montada e avisa
      setStillBlocked(true)
    }
  }

  const adminText =
    reason === 'INACTIVE'
      ? 'A empresa está desativada. Nenhum dado foi apagado. Você ainda vê o Contrato e o Plano e cobrança. Fale com a Addere.'
      : 'O app e o painel estão suspensos. Nenhum dado foi apagado. Você ainda vê o Contrato e o Plano e cobrança.'

  return (
    <div className="flex justify-center pt-8 sm:pt-16">
      <Card className="w-full max-w-lg p-6 text-center sm:p-8">
        <Lock
          size={40}
          strokeWidth={1.5}
          className="mx-auto text-[var(--text-muted)]"
          aria-hidden
        />
        <h1 className="mt-4 font-heading text-xl font-bold text-[var(--text-primary)]">
          {isAdmin ? 'Acesso da empresa suspenso' : 'Acesso da sua empresa suspenso.'}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {isAdmin ? adminText : 'Fale com o administrador.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {isAdmin && <Button onClick={() => router.push('/plano')}>Ver Plano e cobrança</Button>}
          <Button variant="outline" loading={checking} onClick={recheck}>
            Verificar de novo
          </Button>
        </div>
        {stillBlocked && !checking && (
          <p role="status" className="mt-3 text-xs text-[var(--text-muted)]">
            Ainda suspenso.
          </p>
        )}
      </Card>
    </div>
  )
}
