import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lock } from 'lucide-react-native'
import { Button } from '../src/components/ui/Button'
import { useLogout } from '../src/hooks/useAuth'
import { processSyncQueue } from '../src/services/syncEngine'
import { useAuthStore } from '../src/store/auth.store'
import { selectPendingCount, selectPendingItems, useSyncStore } from '../src/store/syncStore'
import { colors, spacing, typography } from '../src/theme'

// Tela de acesso suspenso (plano 017). A empresa está bloqueada (atraso ou
// desativada): a sessão continua, nada é apagado, e a fila de envios espera
// sem gastar tentativa. O AuthGuard (app/_layout.tsx) traz o usuário para cá e
// o leva de volta ao app quando o /auth/me disser que o acesso voltou.
export default function BloqueadoScreen() {
  const recheckCompanyAccess = useAuthStore((s) => s.recheckCompanyAccess)
  const logout = useLogout()
  const pendingCount = useSyncStore(selectPendingCount)
  // "pedido" só quando a fila é só de pedidos (o mesmo critério do SyncStatusBar)
  const onlyOrders = useSyncStore((s) => selectPendingItems(s).every((i) => i.type === 'order'))
  const [checking, setChecking] = useState(false)
  const [stillBlocked, setStillBlocked] = useState(false)

  const recheck = useCallback(async () => {
    setChecking(true)
    try {
      const blocked = await recheckCompanyAccess()
      setStillBlocked(blocked)
      // Liberada: a fila não espera o próximo ciclo de 30 s
      if (!blocked) processSyncQueue().catch(() => undefined)
    } finally {
      setChecking(false)
    }
  }, [recheckCompanyAccess])

  // Voltou ao primeiro plano (o pagamento pode ter sido baixado): confere de novo
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck()
    })
    return () => subscription.remove()
  }, [recheck])

  const noun = onlyOrders ? 'pedido' : 'envio'
  const queueLine =
    pendingCount === 1
      ? `1 ${noun} aguardando envio. Ele será enviado quando o acesso voltar.`
      : `${pendingCount} ${noun}s aguardando envio. Eles serão enviados quando o acesso voltar.`

  return (
    <SafeAreaView style={s.container} testID="screen-bloqueado">
      <View style={s.content}>
        <Lock size={48} strokeWidth={1.5} color={colors.semantic.muted} />
        <Text style={s.title}>Acesso da sua empresa suspenso.</Text>
        <Text style={s.body}>Fale com o administrador.</Text>
        {pendingCount > 0 && <Text style={s.queue}>{queueLine}</Text>}

        <View style={s.actions}>
          <Button testID="btn-bloqueado-tentar" loading={checking} onPress={() => void recheck()}>
            Tentar novamente
          </Button>
          <Button
            testID="btn-bloqueado-sair"
            variant="ghost"
            disabled={logout.isPending}
            onPress={() => logout.mutate()}
          >
            Sair
          </Button>
        </View>
        {stillBlocked && !checking && <Text style={s.still}>Ainda suspenso.</Text>}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    marginTop: spacing.lg,
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.xl,
    color: colors.neutral.text,
    textAlign: 'center',
  },
  body: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.neutral.textSub,
    textAlign: 'center',
  },
  queue: {
    marginTop: spacing.lg,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    textAlign: 'center',
  },
  actions: { marginTop: spacing.xl, alignSelf: 'stretch', gap: spacing.sm },
  still: {
    marginTop: spacing.md,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    textAlign: 'center',
  },
})
