import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

export default function ProdutosLayout() {
  return (
    <Stack screenOptions={brandScreenOptions}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
