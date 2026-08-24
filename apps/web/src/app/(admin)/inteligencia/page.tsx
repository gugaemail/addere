'use client'

// Home da Inteligência (E9; links ativados na E10) — destino de login de
// ADMIN/gerente, com atalhos para as três telas admin.
import Link from 'next/link'
import { Activity, Database, SlidersHorizontal } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/contexts/AuthContext'

const SHORTCUTS = [
  {
    icon: Database,
    title: 'Consultas',
    href: '/inteligencia/consultas',
    description: 'Configurar e validar as consultas SQL que alimentam a Inteligência.',
  },
  {
    icon: Activity,
    title: 'Saúde dos dados',
    href: '/inteligencia/saude',
    description: 'Frescor por job, completude do cadastro e itens a corrigir no Protheus.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Premissas',
    href: '/inteligencia/premissas',
    description: 'Régua do motor: ciclo, risco, capacidade de visitas e pesos do ranking.',
  },
]

export default function IntelligenceHomePage() {
  const { user, isSuperAdmin, intelligenceEnabled } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Inteligência
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Sinais, plano do dia e saúde dos dados da sua operação comercial.
        </p>
      </div>

      {!isSuperAdmin && user && !intelligenceEnabled && (
        <Card className="border-warning/30 bg-warning/5">
          <p className="text-sm text-[var(--text-secondary)]">
            A camada de Inteligência ainda está desligada para a sua empresa. Fale com o
            administrador da plataforma para ativá-la.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SHORTCUTS.map(({ icon: Icon, title, href, description }) => (
          <Link key={title} href={href} className="group">
            <Card className="h-full space-y-2 transition-colors group-hover:border-brand/40">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10">
                <Icon size={18} strokeWidth={1.5} className="text-brand" aria-hidden />
              </span>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-brand">
                {title}
              </h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
