import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/store/auth.store'

function AuthGuard() {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, hydrated, hydrate } = useAuthStore()

  // Hidrata o token salvo no SecureStore ao abrir o app
  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    if (!hydrated) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!accessToken && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (accessToken && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [accessToken, hydrated, segments])

  return null
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
