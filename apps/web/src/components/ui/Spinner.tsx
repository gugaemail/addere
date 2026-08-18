import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 16, md: 24, lg: 40 }

// Indicador de carregamento — ícone Lucide na cor da marca
export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2
      size={sizes[size]}
      strokeWidth={1.5}
      className={cn('animate-spin text-brand shrink-0', className)}
      aria-label="Carregando"
    />
  )
}
