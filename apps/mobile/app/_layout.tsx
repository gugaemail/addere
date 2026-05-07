import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from '../src/hooks/useFonts'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/store/auth.store'
import { useCompanyStore } from '../src/store/company.store'
import { SplashScreen } from '../src/screens/SplashScreen'

function AuthGuard() {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, hydrated, hydrate } = useAuthStore()
  const hydrateFieldConfig = useCompanyStore((s) => s.hydrateFieldConfig)

  useEffect(() => {
    hydrate()
    hydrateFieldConfig()
  }, [])

  useEffect(() => {
    if (!hydrated) return

    const inAuthGroup   = segments[0] === '(auth)'
    const inDevPreview  = segments[0] === 'dev-preview'

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
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
