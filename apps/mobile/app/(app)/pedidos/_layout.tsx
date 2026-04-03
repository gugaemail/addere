import { Stack } from 'expo-router'

export default function PedidosLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Pedidos' }} />
    </Stack>
  )
}
