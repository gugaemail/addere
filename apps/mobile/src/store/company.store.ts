import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { CompanyFieldConfig } from '@addere/types'

const FIELD_CONFIG_KEY = 'addere_field_config'

interface CompanyState {
  fieldConfig: CompanyFieldConfig | null
  setFieldConfig: (cfg: CompanyFieldConfig) => Promise<void>
  clearFieldConfig: () => Promise<void>
  hydrateFieldConfig: () => Promise<void>
}

export const useCompanyStore = create<CompanyState>((set) => ({
  fieldConfig: null,

  setFieldConfig: async (cfg) => {
    await SecureStore.setItemAsync(FIELD_CONFIG_KEY, JSON.stringify(cfg))
    set({ fieldConfig: cfg })
  },

  clearFieldConfig: async () => {
    await SecureStore.deleteItemAsync(FIELD_CONFIG_KEY)
    set({ fieldConfig: null })
  },

  // Restaura config do SecureStore no boot (disponível offline)
  hydrateFieldConfig: async () => {
    const raw = await SecureStore.getItemAsync(FIELD_CONFIG_KEY)
    if (raw) set({ fieldConfig: JSON.parse(raw) as CompanyFieldConfig })
  },
}))
