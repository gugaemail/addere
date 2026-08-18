import { useState } from 'react'
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
import { Input } from '../../src/components/ui/Input'
import { Button } from '../../src/components/ui/Button'
import { LogoMark } from '../../src/components/brand/LogoMark'
import { api } from '../../src/lib/api'
import { colors, spacing, radius, typography } from '../../src/theme'

export default function EsqueciSenhaScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>(undefined)
  const [isPending, setIsPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setEmailError(undefined)

    setIsPending(true)
    try {
      await api.post('/auth/forgot-password', { email: trimmed })
      setSent(true)
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o e-mail. Tente novamente.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.logoGroup}>
            <LogoMark size={56} variant="light" />
            <Text style={s.appName}>Addere</Text>
            <Text style={s.title}>Recuperar senha</Text>
          </View>

          {sent ? (
            <View style={s.successBox}>
              <Text style={s.successTitle}>E-mail enviado!</Text>
              <Text style={s.successText}>
                Verifique sua caixa de entrada e clique no link para redefinir sua senha. O link
                expira em 1 hora.
              </Text>
              <Button variant="ghost" size="sm" onPress={() => router.back()} style={s.backBtn}>
                Voltar para o login
              </Button>
            </View>
          ) : (
            <>
              <Text style={s.description}>
                Informe seu e-mail e enviaremos um link para você redefinir sua senha.
              </Text>

              <View style={s.fields}>
                <Input
                  label="E-mail"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t)
                    if (emailError) setEmailError(undefined)
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  error={emailError}
                />

                <Button onPress={handleSubmit} loading={isPending} size="lg" style={s.button}>
                  Enviar link de recuperação
                </Button>

                <Button variant="ghost" size="sm" onPress={() => router.back()}>
                  Voltar para o login
                </Button>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
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
  logoGroup: { alignItems: 'center', marginBottom: spacing.lg },
  appName: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 28,
    color: colors.brand.dark,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  description: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: colors.neutral.textSub,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  fields: { gap: spacing.md },
  button: { marginTop: spacing.sm },
  successBox: { alignItems: 'center', gap: spacing.md },
  successTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 18,
    color: colors.semantic.success,
  },
  successText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: colors.neutral.textSub,
    textAlign: 'center',
    lineHeight: 20,
  },
  backBtn: { marginTop: spacing.sm },
})
