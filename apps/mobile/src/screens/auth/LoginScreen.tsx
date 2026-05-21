import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { z } from 'zod'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as LocalAuthentication from 'expo-local-authentication'
import axios from 'axios'
import { useLogin, BIOMETRIC_KEY } from '../../hooks/useAuth'
import { useAuthStore } from '../../store/auth.store'
import { useCompanyStore } from '../../store/company.store'
import { api } from '../../lib/api'
import { env } from '../../config/env'
import { LogoMark } from '../../components/brand/LogoMark'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import type { CompanyFieldConfig } from '@addere/types'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showBiometric, setShowBiometric] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const { mutate: login, isPending, error } = useLogin()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setFieldConfig = useCompanyStore((s) => s.setFieldConfig)

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

      const { data: refreshData } = await axios.post(
        `${env.apiUrl}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 8000 }
      )
      const { data: userData } = await api.get('/auth/me')
      await setAuth(userData, refreshData.accessToken)
      try {
        const { data: cfg } = await api.get<CompanyFieldConfig>('/companies/me/field-config')
        await setFieldConfig(cfg)
      } catch { /* ignora */ }
      // AuthGuard navega para /(app) automaticamente ao detectar accessToken
    } catch {
      Alert.alert(
        'Sessão expirada',
        'Não foi possível autenticar. Faça login com e-mail e senha.',
        [{ text: 'OK' }]
      )
      setShowBiometric(false)
    } finally {
      setBiometricLoading(false)
    }
  }

  const apiErrorMessage = error
    ? ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao conectar com o servidor')
    : null

  function handleLogin() {
    setValidationError(null)
    const result = schema.safeParse({ email, password })
    if (!result.success) {
      setValidationError(result.error.errors[0].message)
      return
    }
    login(result.data)
  }

  const errorMessage = validationError ?? apiErrorMessage

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
            />
            <Input
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {errorMessage && (
              <Text style={styles.error}>{errorMessage}</Text>
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
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={biometricLoading}
                style={styles.biometricBtn}
                activeOpacity={0.75}
              >
                {biometricLoading
                  ? <ActivityIndicator size={18} color="#1B4FA8" />
                  : <Text style={styles.biometricText}>🔐 Entrar com biometria</Text>
                }
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => router.push('/(auth)/esqueci-senha')} style={styles.forgotWrapper}>
              <Text style={styles.forgotText}>Esqueci minha senha</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  logoGroup: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 28,
    color: '#0D2045',
    marginTop: 12,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  fields: {
    gap: 12,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#DC2626',
  },
  button: {
    marginTop: 8,
  },
  biometricBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },
  biometricText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#1B4FA8',
  },
  forgotWrapper: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#1B4FA8',
  },
})
