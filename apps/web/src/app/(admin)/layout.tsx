'use client'

import { usePathname, useRouter } from 'next/navigation'
import { api, clearAccessToken } from '@/lib/api'
import { useTheme } from '../theme-provider'
import { Logo } from '@/components/Logo'

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Empresas',
    match: (p: string) => p.startsWith('/dashboard') || p.startsWith('/empresas'),
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } finally {
      clearAccessToken()
      router.push('/login')
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-page)]">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-950 dark:bg-[#0a0e1a] text-white flex flex-col border-r border-white/5 shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
          <Logo size={28} />
          <span style={{ fontFamily: 'var(--font-heading), sans-serif', fontSize: 16, letterSpacing: '-0.02em' }} className="font-bold text-white">addere</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:bg-white/6 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/5 space-y-0.5">
          {/* Toggle tema */}
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/6 hover:text-white transition-colors"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
            )}
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
            </svg>
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
