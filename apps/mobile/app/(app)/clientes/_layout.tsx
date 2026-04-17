import { Stack } from 'expo-router'
import { brandScreenOptions } from '../../../src/navigation/BrandHeader'

export default function ClientesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={brandScreenOptions} />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Detalhe do Cliente',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0D2045',
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 16,
          },
        }}
      />
    </Stack>
  )
}
