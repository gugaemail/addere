import { Stack } from 'expo-router'

export default function NovoPedidoLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Novo Pedido' }} />
    </Stack>
  )
}
