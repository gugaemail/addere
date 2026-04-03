import { Stack } from 'expo-router'

export default function ClientesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Clientes' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalhe do Cliente' }} />
    </Stack>
  )
}
