// Stack da aba Rota (E12) — telas preenchidas na E13.
import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

export default function RotaLayout() {
  return (
    <Stack screenOptions={brandScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Plano do dia' }} />
      <Stack.Screen name="visita/[itemId]" options={{ title: 'Visita' }} />
      <Stack.Screen name="mensagem/[customerKey]" options={{ title: 'Mensagem' }} />
    </Stack>
  )
}
