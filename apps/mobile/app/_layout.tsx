import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'
import { BIOMETRIC_KEY } from '../src/hooks/useAuth'
import { QueryClientProvider } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import * as Sentry from '@sentry/react-native'
import { env } from '../src/config/env'
import { useFonts } from '../src/hooks/useFonts'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/store/auth.store'
import { useCompanyStore } from '../src/store/company.store'
import { useSyncStore } from '../src/store/syncStore'
import { startSyncListener } from '../src/services/syncEngine'
import { pilotTracker } from '../src/services/pilotTracking'
import { AppErrorBoundary } from '../src/components/ErrorBoundary'
import { SplashScreen } from '../src/screens/SplashScreen'

Sentry.init({
  dsn: env.sentryDsn,
  environment: env.appEnv,
  release: env.appVersion,
  enabled: env.appEnv !== 'development',
  tracesSampleRate: env.appEnv === 'production' ? 0.2 : 1.0,

  beforeSend(event) {
    // Nunca enviar dados de pedidos em claro
    if (event.extra?.payload) {
      event.extra.payload = '[REDACTED]'
    }
    return event
  },
})

function AuthGuard() {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, hydrated, hydrate } = useAuthStore()
  const hydrateFieldConfig = useCompanyStore((s) => s.hydrateFieldConfig)
  const setNetworkAvailable = useSyncStore((s) => s.setNetworkAvailable)

  // Biometric gate: checked once per app lifecycle
  const biometricCheckedRef = useRef(false)
  const [biometricReady, setBiometricReady] = useState(false)

  useEffect(() => {
    hydrate()
    hydrateFieldConfig()
  }, [])

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkAvailable(state.isConnected ?? false)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const cleanup = startSyncListener()
    return cleanup
  }, [])

  useEffect(() => {
    pilotTracker.track({ type: 'SESSION_STARTED' })
    pilotTracker.startAutoFlush()
    return () => pilotTracker.stopAutoFlush()
  }, [])

  // Verifica biometria uma única vez após hydration
  useEffect(() => {
    if (!hydrated || biometricCheckedRef.current) return
    biometricCheckedRef.current = true

    if (!accessToken) {
      setBiometricReady(true)
      return
    }

    AsyncStorage.getItem(BIOMETRIC_KEY).then(async (val) => {
      if (val !== 'true') {
        setBiometricReady(true)
        return
      }

      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Entre no Addere',
          cancelLabel: 'Usar senha',
          disableDeviceFallback: false,
        })
        if (result.success) {
          setBiometricReady(true)
        } else {
          await useAuthStore.getState().clearAuth()
          setBiometricReady(true)
        }
      } catch {
        // Falha inesperada → deixa passar sem biometria
        setBiometricReady(true)
      }
    })
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || !biometricReady) return

    const inAuthGroup  = segments[0] === '(auth)'
    const inDevPreview = segments[0] === 'dev-preview'

    if (inDevPreview) return

    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [accessToken, hydrated, segments, biometricReady])

  return null
}

export default function RootLayout() {
  const { fontsLoaded } = useFonts()

  if (!fontsLoaded) return <SplashScreen />

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
