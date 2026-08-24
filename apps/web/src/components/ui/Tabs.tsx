'use client'

import { cn } from '@/lib/utils'

export interface TabItem {
  key: string
  label: string
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

// Abas controladas com sublinhado na cor da marca (padrão das telas W3/W4/W5).
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-[var(--border)]', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'px-3 py-2 -mb-px text-sm border-b-2 transition-colors',
              isActive
                ? 'border-brand text-brand font-medium'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
