import { Stack } from 'expo-router'

export default function ProdutosLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Produtos' }} />
    </Stack>
  )
}
