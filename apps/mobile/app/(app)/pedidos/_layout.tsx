import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

export default function PedidosLayout() {
  return (
    <Stack style={{ flex: 1 }}>
        <Stack.Screen name="index" options={brandScreenOptions} />
        <Stack.Screen
          name="[id]"
          options={{
            title: 'Detalhe do Pedido',
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#0D2045',
            headerShadowVisible: false,
            headerTitleStyle: {
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 16,
            },
          }}
        />
        <Stack.Screen
          name="pendentes"
          options={{
            title: 'Pedidos Pendentes',
            headerStyle: { backgroundColor: '#FFFFFF' },
            headerTintColor: '#0D2045',
            headerShadowVisible: false,
            headerTitleStyle: {
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 16,
            },
          }}
        />
        <Stack.Screen name="pedido/[id]" options={{ title: 'Detalhe do Pedido', headerStyle: { backgroundColor: '#FFFFFF' }, headerTintColor: '#0D2045', headerShadowVisible: false, headerTitleStyle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16 } }} />
    </Stack>
  )
}
