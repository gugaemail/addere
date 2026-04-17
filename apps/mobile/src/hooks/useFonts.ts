import { useFonts as useExpoFonts } from 'expo-font'
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

export function useFonts(): { fontsLoaded: boolean } {
  const [fontsLoaded] = useExpoFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Inter_400Regular,
    Inter_700Bold,
  })

  return { fontsLoaded: fontsLoaded ?? false }
}
