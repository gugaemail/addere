import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans'
import {
  Inter_400Regular,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { queryClient } from '../src/lib/query-client'
import { useAuthStore } from '../src/store/auth.store'

function AuthGuard() {
  const router = useRouter()
  const segments = useSegments()
  const { accessToken, hydrated, hydrate } = useAuthStore()

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
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_700Bold,
  })

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
