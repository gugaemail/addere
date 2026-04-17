import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { User } from 'lucide-react-native'
import { LogoMark } from '../components/brand/LogoMark'
import { useLogout } from '../hooks/useAuth'

export function BrandHeader() {
  const insets = useSafeAreaInsets()
  const { mutate: logout } = useLogout()

  function handleUserPress() {
    Alert.alert(
      'Conta',
      'Deseja encerrar a sessão?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => logout() },
      ],
    )
  }

  return (
    <View style={[s.wrapper, { paddingTop: insets.top }]}>
      <View style={s.row}>
        <View style={s.left}>
          <LogoMark size={28} variant="light" />
          <Text style={s.wordmark}>addere</Text>
        </View>
        <TouchableOpacity onPress={handleUserPress} style={s.userBtn} activeOpacity={0.7}>
          <User size={18} color="#1B4FA8" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export const brandScreenOptions = {
  header: () => <BrandHeader />,
} as const

const s = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#0D2045',
    letterSpacing: 16 * -0.02,
    marginLeft: 8,
  },
  userBtn: {
    backgroundColor: '#E8F4FF',
    borderRadius: 6,
    padding: 6,
  },
})
