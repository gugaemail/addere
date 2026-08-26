'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Toaster } from 'sonner'
import {
  Activity,
  Building2,
  BarChart3,
  Database,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { clearAccessToken } from '@/lib/api'
import { useTheme } from '../theme-provider'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'
import { useCompanies } from '@/hooks/useCompanies'
import { canAccessPanel } from '@/lib/home-redirect'
import { filterNavGroups, type NavRequirement } from '@/lib/nav-gating'
import { Logo } from '@/components/Logo'

interface NavItem {
  href: string
  label: string
  match: (p: string) => boolean
  icon: LucideIcon
  requires?: NavRequirement
}

interface NavGroup {
  title: string
  items: NavItem[]
}

// Grupos da sidebar (E9). O gating é puro (lib/nav-gating) e testado;
// grupos sem itens visíveis somem inteiros.
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Operação',
    items: [
      {
        href: '/users',
        label: 'Usuários',
        match: (p) => p.startsWith('/users'),
        icon: Users,
        requires: 'admin',
      },
    ],
  },
  {
    // As três telas da E10 ficam no menu, não só como cards da Visão geral:
    // procurar "Saúde" na sidebar e não achar é o caminho natural de quem usa.
    title: 'Inteligência',
    items: [
      {
        href: '/inteligencia',
        label: 'Visão geral',
        // Exato: senão a Visão geral fica destacada em todas as subtelas
        match: (p) => p === '/inteligencia',
        icon: Sparkles,
        requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
      },
      {
        href: '/inteligencia/equipe',
        label: 'Equipe em campo',
        match: (p) => p.startsWith('/inteligencia/equipe'),
        icon: Users,
        requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
      },
      {
        href: '/inteligencia/consultas',
        label: 'Consultas',
        match: (p) => p.startsWith('/inteligencia/consultas'),
        icon: Database,
        requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
      },
      {
        href: '/inteligencia/saude',
        label: 'Saúde dos dados',
        match: (p) => p.startsWith('/inteligencia/saude'),
        icon: Activity,
        requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
      },
      {
        href: '/inteligencia/premissas',
        label: 'Premissas',
        match: (p) => p.startsWith('/inteligencia/premissas'),
        icon: SlidersHorizontal,
        requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
      },
    ],
  },
  {
    title: 'Empresa',
    items: [
      {
        href: '/dashboard',
        label: 'Empresas',
        match: (p) => p.startsWith('/dashboard') || p.startsWith('/empresas'),
        icon: Building2,
        requires: 'superadmin',
      },
      {
        href: '/piloto',
        label: 'Piloto',
        match: (p) => p.startsWith('/piloto'),
        icon: BarChart3,
        requires: 'superadmin',
      },
    ],
  },
]

// Seletor de tenant do SUPERADMIN (E9) — persiste em localStorage via contexto.
// Renderizado só para SUPERADMIN (o GET /companies é restrito a ele).
function CompanySelector() {
  const { companyId, setCompanyId } = useCompanyContext()
  const { data: companies = [] } = useCompanies()

  return (
    <div className="px-3 pt-3">
      <label
        htmlFor="company-selector"
        className="block px-2 pb-1 text-[11px] uppercase tracking-wider text-white/40"
      >
        Empresa ativa
      </label>
      <select
        id="company-selector"
        value={companyId ?? ''}
        onChange={(e) => setCompanyId(e.target.value || null)}
        className="w-full rounded-lg bg-white/5 border border-white/10 text-white text-xs px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <option value="" className="text-navy">
          Selecione…
        </option>
        {companies.map((company) => (
          <option key={company.id} value={company.id} className="text-navy">
            {company.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// Classe base dos itens da sidebar (fundo navy fixo nos dois temas)
const SIDEBAR_ITEM =
  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { user, isLoading, isAdmin, isSuperAdmin, hasPermission, logout } = useAuth()

  const navGroups = filterNavGroups(NAV_GROUPS, { isSuperAdmin, isAdmin, hasPermission })

  // E9: sessão sem acesso ao painel volta ao login — inclusive quando o
  // restore falhou (user null): sem isso a página vira casca morta sem menu
  useEffect(() => {
    if (isLoading) return
    if (!user) {
      clearAccessToken()
      router.replace('/login')
      return
    }
    if (!canAccessPanel(user)) {
      logout()
        .catch(() => undefined)
        .finally(() => router.replace('/login'))
    }
  }, [isLoading, user, logout, router])

  async function handleLogout() {
    // logout() do contexto: revoga a sessão, limpa cookie/user e o cache do
    // React Query (dados de um tenant não vazam para o próximo login)
    await logout().catch(() => undefined)
    router.push('/login')
  }

  const ThemeIcon = theme === 'dark' ? Sun : Moon

  return (
    <div className="min-h-screen flex bg-[var(--bg-page)]">
      {/* Sidebar — navy da marca nos dois temas */}
      <aside className="w-56 bg-navy dark:bg-[var(--bg-page)] text-white flex flex-col border-r border-white/5 shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <Logo size={28} />
          <span
            style={{
              fontFamily: 'var(--font-heading), sans-serif',
              fontSize: 16,
              letterSpacing: '-0.02em',
            }}
            className="font-bold text-white"
          >
            addere
          </span>
        </div>

        {/* Seletor de tenant (SUPERADMIN) */}
        {isSuperAdmin && <CompanySelector />}

        {/* Nav em grupos (E9) */}
        <nav className="flex-1 px-3 py-4 space-y-4">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-0.5">
              <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-white/40">
                {group.title}
              </p>
              {group.items.map((item) => {
                const active = item.match(pathname)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${SIDEBAR_ITEM} ${
                      active
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/5 space-y-0.5">
          {/* Toggle tema */}
          <button
            type="button"
            onClick={toggle}
            className={`${SIDEBAR_ITEM} text-white/60 hover:bg-white/5 hover:text-white`}
          >
            <ThemeIcon size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className={`${SIDEBAR_ITEM} text-white/60 hover:bg-danger/10 hover:text-danger`}
          >
            <LogOut size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-auto p-8">{children}</main>

      {/* Toasts de feedback (sonner) */}
      <Toaster richColors position="top-right" theme={theme === 'dark' ? 'dark' : 'light'} />
    </div>
  )
}
