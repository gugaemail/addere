import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { z } from 'zod'
import { useLogin } from '../../hooks/useAuth'
import { LogoMark } from '../../components/brand/LogoMark'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const { mutate: login, isPending, error } = useLogin()

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

            <TouchableOpacity onPress={() => {}} style={styles.forgotWrapper}>
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
