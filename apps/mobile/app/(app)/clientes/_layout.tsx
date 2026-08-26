import { Stack } from 'expo-router'
import { brandScreenOptions, detailScreenOptions } from '../../../src/navigation/BrandHeader'

// A tela de detalhe pode ser aberta de outra aba (Ficha no plano, pedido do
// cliente): com o `anchor`, a lista fica embaixo na pilha e o Voltar aparece —
// sem ele a aba montava direto no detalhe, sem saída (decisão 5 do teste geral)
export const unstable_settings = { anchor: 'index' }

export default function ClientesLayout() {
  return (
    <Stack>
      {/* `title` não aparece (o header é o da marca), mas é o rótulo do
          botão de voltar nas telas de detalhe — sem ele o iOS mostra "index" */}
      <Stack.Screen name="index" options={{ title: 'Clientes', ...brandScreenOptions }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalhe do Cliente', ...detailScreenOptions }} />
      <Stack.Screen
        name="pedido/[id]"
        options={{ title: 'Detalhe do Pedido', ...detailScreenOptions }}
      />
    </Stack>
  )
}
