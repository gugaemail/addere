import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { LayoutDashboard, Users, Package, ClipboardList } from 'lucide-react-native'
import { brandScreenOptions } from '../../src/navigation/BrandHeader'
import {
  OnboardingFlow,
  shouldShowOnboarding,
} from '../../src/components/onboarding/OnboardingFlow'
import { FeedbackPrompt } from '../../src/components/FeedbackPrompt'
import { colors, spacing, typography } from '../../src/theme'

export default function AppLayout() {
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    shouldShowOnboarding().then(setShowOnboarding)
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <OnboardingFlow visible={showOnboarding} onComplete={() => setShowOnboarding(false)} />
      <FeedbackPrompt />
      <Tabs
        screenOptions={{
          ...brandScreenOptions,
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: colors.neutral.placeholder,
          tabBarStyle: {
            backgroundColor: colors.neutral.white,
            borderTopColor: colors.neutral.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: spacing.sm,
          },
          tabBarLabelStyle: {
            fontFamily: typography.fontFamily.bodySemibold,
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarButtonTestID: 'tab-dashboard',
            title: 'Dashboard',
            tabBarIcon: ({ color }) => (
              <LayoutDashboard size={22} color={color} strokeWidth={1.5} />
            ),
          }}
        />
        <Tabs.Screen
          name="clientes"
          options={{
            tabBarButtonTestID: 'tab-clientes',
            title: 'Clientes',
            headerShown: false,
            tabBarIcon: ({ color }) => <Users size={22} color={color} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="produtos"
          options={{
            tabBarButtonTestID: 'tab-produtos',
            title: 'Produtos',
            headerShown: false,
            tabBarIcon: ({ color }) => <Package size={22} color={color} strokeWidth={1.5} />,
          }}
        />
        <Tabs.Screen
          name="pedidos"
          options={{
            tabBarButtonTestID: 'tab-pedidos',
            title: 'Pedidos',
            headerShown: false,
            tabBarIcon: ({ color }) => <ClipboardList size={22} color={color} strokeWidth={1.5} />,
          }}
        />
        {/* Rota oculta da tab bar — acessada via FAB */}
        <Tabs.Screen name="novo-pedido" options={{ href: null }} />
      </Tabs>
    </View>
  )
}
