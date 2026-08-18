import { Spinner } from '@/components/ui/Spinner'

// Loading padrão das rotas do painel admin (App Router)
export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size="lg" />
    </div>
  )
}
