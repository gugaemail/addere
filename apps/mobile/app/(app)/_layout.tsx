import { Tabs } from 'expo-router'
import { Text } from 'react-native'

// Ícones inline simples para não depender de biblioteca de ícones
const Icon = ({ label }: { label: string }) => (
  <Text style={{ fontSize: 20 }}>{label}</Text>
)

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: () => <Icon label="🏠" />,
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: () => <Icon label="👥" />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: 'Produtos',
          tabBarIcon: () => <Icon label="📦" />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: 'Pedidos',
          tabBarIcon: () => <Icon label="📋" />,
          headerShown: false,
        }}
      />
      {/* Rota oculta da tab bar — acessada via FAB */}
      <Tabs.Screen
        name="novo-pedido"
        options={{ href: null }}
      />
    </Tabs>
  )
}
