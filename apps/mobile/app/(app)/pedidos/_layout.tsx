import { Stack } from 'expo-router'
import { brandScreenOptions, detailScreenOptions } from '../../../src/navigation/BrandHeader'

export default function PedidosLayout() {
  return (
    <Stack>
      {/* `title` não aparece (o header é o da marca), mas é o rótulo do
          botão de voltar nas telas de detalhe — sem ele o iOS mostra "index" */}
      <Stack.Screen name="index" options={{ title: 'Pedidos', ...brandScreenOptions }} />
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
