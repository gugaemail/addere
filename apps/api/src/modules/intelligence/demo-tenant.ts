// Tenant de demonstração (E14b): empresa que roda inteiramente sobre dados
// sintéticos, sem tocar no Protheus nem no geocoder externo.
//
// Existe por uma razão só: screenshot de loja e conta do revisor da Apple não
// podem expor cliente real. Sem isso, a única saída era logar o revisor numa
// empresa de verdade e entregar a carteira comercial dela a um terceiro.
//
// Lê o JSON cru em vez de `mergeIntelligenceConfig` de propósito: este módulo é
// importado pelo adapter e pelo job de geo, e passar pelas rotas de admin
// criaria ciclo de import.

/** Empresa marcada como demonstração em `intelligenceConfig.demoData`. */
export function isDemoTenant(company: { intelligenceConfig?: unknown } | null): boolean {
  const config = company?.intelligenceConfig
  if (typeof config !== 'object' || config === null) return false
  return (config as { demoData?: unknown }).demoData === true
}
