import { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { z } from 'zod'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'
import { useLogin, BIOMETRIC_KEY } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/auth.store'
import { useCompanyStore } from '../../store/company.store'
import { api } from '../../lib/api'
import { LogoMark } from '../../components/brand/LogoMark'
import { getApiErrorMessage } from '../../lib/errors'
import { Input } from '../../components/ui/Input'
import { Button, buttonForeground } from '../../components/ui/Button'
import { Fingerprint } from 'lucide-react-native'
import { colors, spacing, radius, typography } from '../../theme'
import type { CompanyFieldConfig, SyncSchedule, UserPublic } from '@addere/types'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [showBiometric, setShowBiometric] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const { mutate: login, isPending, error } = useLogin()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setFieldConfig  = useCompanyStore((s) => s.setFieldConfig)
  const setSyncSchedule = useCompanyStore((s) => s.setSyncSchedule)

  useEffect(() => {
    async function checkBiometric() {
      const enabled = await AsyncStorage.getItem(BIOMETRIC_KEY)
      if (enabled !== 'true') return
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const isEnrolled  = await LocalAuthentication.isEnrolledAsync()
      if (hasHardware && isEnrolled) setShowBiometric(true)
    }
    checkBiometric()
  }, [])

  async function handleBiometricLogin() {
    setBiometricLoading(true)
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entre no Addere',
        cancelLabel: 'Usar e-mail e senha',
        disableDeviceFallback: false,
      })
      if (!result.success) { setBiometricLoading(false); return }

      // refreshSession (auth.store) centraliza cookie + fallback SecureStore
      // e já persiste os tokens rotacionados e popula o store
      const accessToken = await useAuthStore.getState().refreshSession()

      const { data: userData } = await api.get<UserPublic>('/auth/me')
      await setAuth(userData, accessToken)
      try {
        const { data: cfg } = await api.get<CompanyFieldConfig>('/companies/me/field-config')
        await setFieldConfig(cfg)
      } catch { /* ignora */ }
      try {
        const { data: s } = await api.get<SyncSchedule>('/companies/me/sync-schedule')
        await setSyncSchedule(s)
      } catch { /* ignora */ }
      // AuthGuard navega para /(app) automaticamente ao detectar accessToken
    } catch {
      Alert.alert(
        'Sessão expirada',
        'Não foi possível autenticar. Faça login com e-mail e senha.',
        [{ text: 'OK' }]
      )
      // Não esconde o botão — usuário pode tentar novamente ou usar email/senha
    } finally {
      setBiometricLoading(false)
    }
  }

  const apiErrorMessage = error
    ? getApiErrorMessage(error, 'Erro ao conectar com o servidor')
    : null

  function handleLogin() {
    setFieldErrors({})
    const result = schema.safeParse({ email, password })
    if (!result.success) {
      const { fieldErrors: fe } = result.error.flatten()
      setFieldErrors({ email: fe.email?.[0], password: fe.password?.[0] })
      return
    }
    login(result.data)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Logo group */}
          <View style={styles.logoGroup}>
            <LogoMark size={56} variant="light" />
            <Text style={styles.title}>Addere</Text>
            <Text style={styles.subtitle}>ERP Mobile</Text>
          </View>

          {/* Inputs */}
          <View style={styles.fields}>
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              error={fieldErrors.email}
            />
            <Input
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={fieldErrors.password}
            />

            {apiErrorMessage && (
              <Text style={styles.error}>{apiErrorMessage}</Text>
            )}

            <Button
              onPress={handleLogin}
              loading={isPending}
              size="lg"
              style={styles.button}
            >
              Entrar
            </Button>

            {showBiometric && (
              <Button
                variant="secondary"
                onPress={handleBiometricLogin}
                loading={biometricLoading}
                icon={<Fingerprint size={18} strokeWidth={1.5} color={buttonForeground.secondary} />}
              >
                Entrar com biometria
              </Button>
            )}

            <Button variant="ghost" size="sm" onPress={() => router.push('/(auth)/esqueci-senha')}>
              Esqueci minha senha
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: colors.neutral.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  logoGroup: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 28,
    color: colors.brand.dark,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  fields: {
    gap: spacing.md,
  },
  error: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.semantic.danger,
  },
  button: {
    marginTop: spacing.sm,
  },
})
