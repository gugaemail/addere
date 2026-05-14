'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '▪' },
  { href: '/orders', label: 'Pedidos', icon: '▪' },
  { href: '/customers', label: 'Clientes', icon: '▪' },
  { href: '/products', label: 'Produtos', icon: '▪' },
]

const adminItems = [
  { href: '/users', label: 'Usuários', icon: '▪' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, isAdmin, logout } = useAuth()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-gray-800">
        <span className="text-lg font-bold text-white">Addere Admin</span>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-gray-800 text-blue-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            {item.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="my-2 border-t border-gray-800" />
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-gray-800 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Usuário + Logout */}
      <div className="border-t border-gray-800 p-4">
        <p className="text-sm font-medium text-white truncate">{user?.name}</p>
        <p className="text-xs text-gray-500 truncate mb-3">{user?.email}</p>
        <button
          onClick={logout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
