import { Stack } from 'expo-router'
import { brandScreenOptions, detailScreenOptions } from '../../../src/navigation/BrandHeader'

export default function PedidosLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={brandScreenOptions} />
      <Stack.Screen name="[id]" options={{ title: 'Detalhe do Pedido', ...detailScreenOptions }} />
      <Stack.Screen
        name="pendentes"
        options={{ title: 'Pedidos Pendentes', ...detailScreenOptions }}
      />
      <Stack.Screen
        name="pedido/[id]"
        options={{ title: 'Detalhe do Pedido', ...detailScreenOptions }}
      />
    </Stack>
  )
}
