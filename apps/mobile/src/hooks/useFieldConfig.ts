import { useCompanyStore } from '../store/company.store'

export function useFieldVisible(key: string): boolean {
  const fieldConfig = useCompanyStore((s) => s.fieldConfig)
  if (!fieldConfig) return true
  return !fieldConfig.hidden.includes(key)
}
