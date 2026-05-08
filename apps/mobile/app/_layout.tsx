import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
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
    if (!hydrated) return

    const inAuthGroup  = segments[0] === '(auth)'
    const inDevPreview = segments[0] === 'dev-preview'

    if (inDevPreview) return

    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [accessToken, hydrated, segments])

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
