import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Input } from '../../src/components/ui/Input'
import { Button } from '../../src/components/ui/Button'
import { LogoMark } from '../../src/components/brand/LogoMark'
import { api } from '../../src/lib/api'

export default function EsqueciSenhaScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      Alert.alert('E-mail inválido', 'Informe um e-mail válido.')
      return
    }

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
                Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                O link expira em 1 hora.
              </Text>
              <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                <Text style={s.backBtnText}>Voltar para o login</Text>
              </TouchableOpacity>
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
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />

                <Button onPress={handleSubmit} loading={isPending} size="lg" style={s.button}>
                  Enviar link de recuperação
                </Button>

                <TouchableOpacity onPress={() => router.back()} style={s.cancelBtn}>
                  <Text style={s.cancelBtnText}>Voltar para o login</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  scroll:      { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card:        { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  logoGroup:   { alignItems: 'center', marginBottom: 24 },
  appName:     { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, color: '#0D2045', marginTop: 12 },
  title:       { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B', marginTop: 4 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 24 },
  fields:      { gap: 12 },
  button:      { marginTop: 8 },
  cancelBtn:   { alignItems: 'center', paddingVertical: 8 },
  cancelBtnText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B' },
  successBox:  { alignItems: 'center', gap: 12 },
  successTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, color: '#22C55E' },
  successText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  backBtn:     { marginTop: 8 },
  backBtnText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#1B4FA8' },
})
