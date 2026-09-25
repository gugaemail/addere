import { useEffect, useRef, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Stack, useRouter, useSegments } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'
import { BIOMETRIC_KEY } from '../src/hooks/useAuth'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import * as Sentry from '@sentry/react-native'
import { env } from '../src/config/env'
import { useFonts } from '../src/hooks/useFonts'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/store/auth.store'
import { useCompanyStore } from '../src/store/company.store'
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, user, hydrated, hydrate } = useAuthStore()
  const hydrateFieldConfig = useCompanyStore((s) => s.hydrateFieldConfig)
  const hydrateSyncSchedule = useCompanyStore((s) => s.hydrateSyncSchedule)

  // Biometric gate: checked once per app lifecycle
  const biometricCheckedRef = useRef(false)
  const [biometricReady, setBiometricReady] = useState(false)

  useEffect(() => {
    hydrate()
    hydrateFieldConfig()
    hydrateSyncSchedule()
  }, [])

  // O listener de NetInfo vive dentro do startSyncListener — um segundo listener
  // aqui competia escrevendo networkAvailable sem disparar o processamento da fila
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
        // Mesma checagem que o LoginScreen e o useAuth já fazem: sem hardware ou
        // sem biometria cadastrada o prompt falha sempre, e tratar isso como
        // recusa apagava a sessão de quem nunca teve chance de autenticar.
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ])
        if (!hasHardware || !isEnrolled) {
          setBiometricReady(true)
          return
        }

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

    const inAuthGroup = segments[0] === '(auth)'
    // dev-preview dispensa login apenas fora de produção (a própria rota redireciona em prod)
    const inDevPreview = segments[0] === 'dev-preview' && env.appEnv !== 'production'

    if (inDevPreview) return

    // Token e usuário: só o token não basta. O refresh publica o access token
    // antes de existir usuário por trás dele (login biométrico, hidratação), e
    // gatear só nele mandava o app para dentro meio logado — dashboard com
    // "Olá," vazio em vez de continuar no login.
    const authenticated = Boolean(accessToken && user)

    if (!authenticated && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (authenticated && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [accessToken, user, hydrated, segments, biometricReady])

  // Antes da hidratação (e da biometria) o navegador não monta: a rota
  // inicial `(app)/index` subia na frente, disparava as queries do dashboard
  // sem token (3×401), o interceptor renovava pelo cookie e o app piscava o
  // dashboard legado com "Olá," vazio até o guard redirecionar para o login.
  if (!hydrated || !biometricReady) return <SplashScreen />

  return <>{children}</>
}

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rq-offline-cache',
  throttleTime: 1000,
})

// Todas as queries com sucesso são persistidas (inclui 'meta-vendedor',
// que substituiu o antigo cache manual do dashboard em AsyncStorage)

export default function RootLayout() {
  const { fontsLoaded } = useFonts()

  if (!fontsLoaded) return <SplashScreen />

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => query.state.status === 'success',
            },
          }}
        >
          <AuthGuard>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGuard>
        </PersistQueryClientProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  )
}
