import { Tabs } from 'expo-router'
import { LayoutDashboard, Users, Package, ClipboardList } from 'lucide-react-native'
import { brandScreenOptions } from '../../src/navigation/BrandHeader'

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        ...brandScreenOptions,
        tabBarActiveTintColor:   '#1B4FA8',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor:  '#E2E8F0',
          borderTopWidth:  1,
          height:          60,
          paddingBottom:   8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_400Regular',
          fontSize:   11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Users size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: 'Produtos',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Package size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: 'Pedidos',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <ClipboardList size={22} color={color} />
          ),
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
