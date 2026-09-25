'use client'

// Aba Inteligência da empresa (E10): liga/desliga a camada, horários do sync,
// tom das mensagens, retenção e aviso LGPD (§2.13). O formulário é o mesmo
// de /configuracoes (E22) — aqui a empresa vem da URL, não do CompanyContext.
import { IntelConfigForm } from '@/components/intel/IntelConfigForm'

interface IntelligenceTabProps {
  companyId: string
  apiSqlConfigured: boolean
}

export function IntelligenceTab({ companyId, apiSqlConfigured }: IntelligenceTabProps) {
  return <IntelConfigForm companyIdOverride={companyId} apiSqlConfigured={apiSqlConfigured} />
}
