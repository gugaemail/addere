import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LayoutDashboard, Map as MapIcon, Sun, Users, Package, ClipboardList } from 'lucide-react-native'
import { brandScreenOptions } from '../../src/navigation/BrandHeader'
import {
  OnboardingFlow,
  shouldShowOnboarding,
} from '../../src/components/onboarding/OnboardingFlow'
import { FeedbackPrompt } from '../../src/components/FeedbackPrompt'
import { colors, spacing, typography } from '../../src/theme'
import { useIntelEnabled } from '../../src/hooks/useIntelEnabled'

export default function AppLayout() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Abas Hoje/Rota só aparecem quando a empresa tem a Inteligência ligada (E12)
  const intelEnabled = useIntelEnabled()
  // Safe-area inferior: evita a tab bar sobreposta pela barra do sistema (Android) / home indicator (iOS)
  const insets = useSafeAreaInsets()

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
            height: 60 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, spacing.sm),
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
            tabBarButtonTestID: intelEnabled ? 'tab-hoje' : 'tab-dashboard',
            title: intelEnabled ? 'Hoje' : 'Dashboard',
            tabBarIcon: ({ color }) =>
              intelEnabled ? (
                <Sun size={22} color={color} strokeWidth={1.5} />
              ) : (
                <LayoutDashboard size={22} color={color} strokeWidth={1.5} />
              ),
          }}
        />
        {/* Rota (D11): oculta quando a Inteligência está desligada */}
        <Tabs.Screen
          name="rota"
          options={{
            href: intelEnabled ? undefined : null,
            tabBarButtonTestID: 'tab-rota',
            title: 'Rota',
            headerShown: false,
            tabBarIcon: ({ color }) => <MapIcon size={22} color={color} strokeWidth={1.5} />,
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
          name="pedidos"
          options={{
            tabBarButtonTestID: 'tab-pedidos',
            title: 'Pedidos',
            headerShown: false,
            tabBarIcon: ({ color }) => <ClipboardList size={22} color={color} strokeWidth={1.5} />,
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
        {/* Rota oculta da tab bar — acessada via FAB */}
        <Tabs.Screen name="novo-pedido" options={{ href: null }} />
      </Tabs>
    </View>
  )
}
