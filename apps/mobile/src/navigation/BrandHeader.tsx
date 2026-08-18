import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { User } from 'lucide-react-native'
import { LogoMark } from '../components/brand/LogoMark'
import { useLogout } from '../hooks/useAuth'
import { colors, spacing, radius, typography } from '../theme'

export function BrandHeader() {
  const insets = useSafeAreaInsets()
  const { mutate: logout } = useLogout()

  function handleUserPress() {
    Alert.alert('Conta', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => logout() },
    ])
  }

  return (
    <View style={[s.wrapper, { paddingTop: insets.top }]}>
      <View style={s.row}>
        <View style={s.left}>
          <LogoMark size={28} variant="light" />
          <Text style={s.wordmark}>Addere</Text>
        </View>
        <TouchableOpacity onPress={handleUserPress} style={s.userBtn} activeOpacity={0.7}>
          <User size={18} color={colors.brand.primary} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export const brandScreenOptions = {
  header: () => <BrandHeader />,
} as const

// Opções de header para telas de detalhe (título nativo com tipografia da marca)
export const detailScreenOptions = {
  headerStyle: { backgroundColor: colors.neutral.white },
  headerTintColor: colors.brand.dark,
  headerShadowVisible: false,
  headerTitleStyle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 16,
  },
} as const

const s = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.neutral.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.border,
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 16,
    color: colors.brand.dark,
    letterSpacing: 16 * -0.02,
    marginLeft: spacing.sm,
  },
  userBtn: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
})
