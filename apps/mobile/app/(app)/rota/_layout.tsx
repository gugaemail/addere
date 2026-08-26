// Stack da aba Rota (E12) — telas preenchidas na E13.
import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

// A tela de detalhe pode ser aberta de outra aba (Ficha no plano, pedido do
// cliente): com o `anchor`, a lista fica embaixo na pilha e o Voltar aparece —
// sem ele a aba montava direto no detalhe, sem saída (decisão 5 do teste geral)
export const unstable_settings = { anchor: 'index' }

export default function RotaLayout() {
  return (
    <Stack screenOptions={brandScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Plano do dia' }} />
      <Stack.Screen name="visita/[itemId]" options={{ title: 'Visita' }} />
      <Stack.Screen name="mensagem/[customerKey]" options={{ title: 'Mensagem' }} />
    </Stack>
  )
}
