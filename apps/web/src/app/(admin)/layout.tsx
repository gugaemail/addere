'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Toaster } from 'sonner'
import { Building2, BarChart3, LogOut, Moon, Sun, Users, Tags, type LucideIcon } from 'lucide-react'
import { api, clearAccessToken } from '@/lib/api'
import { useTheme } from '../theme-provider'
import { useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/Logo'

interface NavItem {
  href: string
  label: string
  match: (p: string) => boolean
  icon: LucideIcon
  requires?: 'admin' | 'superadmin'
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Empresas',
    match: (p) => p.startsWith('/dashboard') || p.startsWith('/empresas'),
    icon: Building2,
  },
  {
    href: '/piloto',
    label: 'Piloto',
    match: (p) => p.startsWith('/piloto'),
    icon: BarChart3,
  },
  {
    href: '/users',
    label: 'Usuários',
    match: (p) => p.startsWith('/users'),
    icon: Users,
    requires: 'admin',
  },
  {
    href: '/tipos-usuario',
    label: 'Tipos de usuário',
    match: (p) => p.startsWith('/tipos-usuario'),
    icon: Tags,
    requires: 'superadmin',
  },
]

// Classe base dos itens da sidebar (fundo navy fixo nos dois temas)
const SIDEBAR_ITEM =
  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { isAdmin, isSuperAdmin } = useAuth()

  const navItems = NAV_ITEMS.filter((item) => {
    if (item.requires === 'superadmin') return isSuperAdmin
    if (item.requires === 'admin') return isAdmin || isSuperAdmin
    return true
  })

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAccessToken()
      router.push('/login')
    }
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
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
