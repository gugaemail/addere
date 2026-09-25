'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/ui/Spinner'

// /inteligencia/consultas → contrato principal (vendas). Os chips da tela
// [name] navegam entre os cinco contratos.
export default function ConsultasIndexPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/inteligencia/consultas/vendas')
  }, [router])
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}
