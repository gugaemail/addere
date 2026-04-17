import { View, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, color, size, focused }: { name: IoniconsName; color: string; size: number; focused: boolean }) {
  if (focused) {
    return (
      <View style={s.activeIconWrap}>
        <Ionicons name={name} size={size} color="#1B4FA8" />
      </View>
    )
  }
  return <Ionicons name={name} size={size} color={color} />
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor:   '#1B4FA8',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor:  '#E2E8F0',
          borderTopWidth:  1,
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTintColor: '#0D2045',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="people-outline" color={color} size={size} focused={focused} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: 'Produtos',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="cube-outline" color={color} size={size} focused={focused} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="receipt-outline" color={color} size={size} focused={focused} />
          ),
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

const s = StyleSheet.create({
  activeIconWrap: {
    width: 36,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E8F4FF',
    borderWidth: 1.5,
    borderColor: '#1B4FA8',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
