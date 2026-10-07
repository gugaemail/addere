// Stack da Carteira da equipe (E8 fase 2) — aberta a partir do bloco de
// carteira na home do gerente (ManagerHomeScreen).
import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

export default function EquipeLayout() {
  return (
    <Stack screenOptions={brandScreenOptions}>
      <Stack.Screen name="carteira" options={{ title: 'Carteira da equipe' }} />
    </Stack>
  )
}
