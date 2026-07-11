import { useState, useEffect } from 'react'
import { View, Text } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LayoutDashboard, Users, Package, ClipboardList, WifiOff } from 'lucide-react-native'
import { brandScreenOptions } from '../../src/navigation/BrandHeader'
import { OnboardingFlow, shouldShowOnboarding } from '../../src/components/onboarding/OnboardingFlow'
import { FeedbackPrompt } from '../../src/components/FeedbackPrompt'
import { useSyncStore } from '../../src/store/syncStore'

function GlobalOfflineBanner() {
  const networkAvailable = useSyncStore((s) => s.networkAvailable)
  if (networkAvailable) return null
  return (
    <View style={{ backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 8 }}>
      <WifiOff size={12} color="#fff" strokeWidth={1.5} />
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#fff', flex: 1 }}>
        Sem conexão — exibindo dados em cache
      </Text>
    </View>
  )
}

export default function AppLayout() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    shouldShowOnboarding().then(setShowOnboarding)
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <OnboardingFlow
        visible={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />
      <FeedbackPrompt />
      <GlobalOfflineBanner />
      <Tabs
      screenOptions={{
        ...brandScreenOptions,
        tabBarActiveTintColor:   '#1B4FA8',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor:  '#E2E8F0',
          borderTopWidth:  1,
          height:          60 + insets.bottom,
          paddingBottom:   Math.max(insets.bottom, 8),
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
    </View>
  )
}
