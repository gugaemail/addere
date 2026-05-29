import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { CompanyFieldConfig, SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'

const FIELD_CONFIG_KEY    = 'addere_field_config'
const SYNC_SCHEDULE_KEY   = 'addere_sync_schedule'

interface CompanyState {
  fieldConfig:   CompanyFieldConfig | null
  syncSchedule:  SyncSchedule | null
  setFieldConfig:    (cfg: CompanyFieldConfig) => Promise<void>
  clearFieldConfig:  () => Promise<void>
  hydrateFieldConfig:() => Promise<void>
  setSyncSchedule:   (s: SyncSchedule) => Promise<void>
  clearSyncSchedule: () => Promise<void>
  hydrateSyncSchedule: () => Promise<void>
}

export const useCompanyStore = create<CompanyState>((set) => ({
  fieldConfig:  null,
  syncSchedule: null,

  setFieldConfig: async (cfg) => {
    await SecureStore.setItemAsync(FIELD_CONFIG_KEY, JSON.stringify(cfg))
    set({ fieldConfig: cfg })
  },

  clearFieldConfig: async () => {
    await SecureStore.deleteItemAsync(FIELD_CONFIG_KEY)
    set({ fieldConfig: null })
  },

  hydrateFieldConfig: async () => {
    const raw = await SecureStore.getItemAsync(FIELD_CONFIG_KEY)
    if (raw) set({ fieldConfig: JSON.parse(raw) as CompanyFieldConfig })
  },

  setSyncSchedule: async (s) => {
    await SecureStore.setItemAsync(SYNC_SCHEDULE_KEY, JSON.stringify(s))
    set({ syncSchedule: s })
  },

  clearSyncSchedule: async () => {
    await SecureStore.deleteItemAsync(SYNC_SCHEDULE_KEY)
    set({ syncSchedule: null })
  },

  // Restaura do SecureStore no boot — disponível offline
  hydrateSyncSchedule: async () => {
    const raw = await SecureStore.getItemAsync(SYNC_SCHEDULE_KEY)
    set({ syncSchedule: raw ? JSON.parse(raw) as SyncSchedule : DEFAULT_SYNC_SCHEDULE })
  },
}))
