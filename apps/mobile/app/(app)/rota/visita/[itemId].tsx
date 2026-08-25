// Visita (E13) — "antes de entrar" sempre do snapshot (offline), briefing do
// agente quando em cache, mix sugerido → pedido, resultado em 4 botões.
// O check-in já entrou na fila no "Cheguei"; abrindo direto, registra aqui.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { MessageCircle, Navigation, Phone, ShoppingCart } from 'lucide-react-native'
import type { VisitResult } from '@addere/types'
import { useClientes } from '../../../../src/hooks/useClientes'
import { useBriefing, usePlan, useVisitMutation } from '../../../../src/hooks/useIntel'
import { getVisitPosition } from '../../../../src/services/location'
import { openMaps } from '../../../../src/services/navigationLinks'
import { pilotTracker } from '../../../../src/services/pilotTracking'
import { generateUuid } from '../../../../src/utils/uuid'
import { BeforeEnterCard } from '../../../../src/components/intel/BeforeEnterCard'
import { StatusPill } from '../../../../src/components/intel/StatusPill'
import { SyncPill } from '../../../../src/components/intel/SyncPill'
import { FreshnessFooter } from '../../../../src/components/intel/FreshnessFooter'
import { colors, spacing, radius, typography } from '../../../../src/theme'

const RESULTS: { key: VisitResult; label: string }[] = [
  { key: 'ORDER', label: 'Fiz pedido' },
  { key: 'NO_ORDER', label: 'Sem pedido' },
  { key: 'NOT_FOUND', label: 'Não estava' },
  { key: 'RESCHEDULED', label: 'Reagendou' },
]

export default function VisitaScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ itemId: string; clientId?: string }>()
  const { data: plan } = usePlan()
  const visits = useVisitMutation()
  const { data: customers } = useClientes()

  const item = useMemo(
    () => plan?.items.find((i) => i.id === params.itemId) ?? null,
    [plan, params.itemId]
  )
  const briefing = useBriefing(item?.customerCode ?? '', item?.loja ?? '', !!item)

  // Sem clientId na navegação = abriu direto (sem "Cheguei") → check-in aqui
  const clientIdRef = useRef<string | null>(params.clientId ?? null)
  useEffect(() => {
    if (clientIdRef.current || !item) return
    const clientId = generateUuid()
    clientIdRef.current = clientId
    getVisitPosition().then((position) => {
      visits.checkIn({
        clientId,
        planItemId: item.id,
        customerCode: item.customerCode,
        loja: item.loja,
        arrivedAt: new Date().toISOString(),
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        accuracyM: position?.accuracyM ?? null,
      })
      pilotTracker.track({ type: 'VISIT_CHECKIN', metadata: { hasGps: !!position } })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  const [result, setResult] = useState<VisitResult | null>(null)
  const [noOrderReason, setNoOrderReason] = useState('')

  const customerId = useMemo(() => {
    if (!item) return null
    return (
      customers?.find((c) => c.protheusCode === item.customerCode && (c.loja ?? '01') === item.loja)
        ?.id ?? null
    )
  }, [customers, item])
  const customerPhone = item?.customerPhone ?? null

  const startOrder = useCallback(() => {
    if (!customerId) {
      Alert.alert('Cliente não sincronizado', 'Abra a lista de clientes e sincronize antes de criar o pedido.')
      return
    }
    router.push({
      pathname: '/novo-pedido',
      params: { customerId, visitClientId: clientIdRef.current ?? '' },
    })
  }, [customerId, router])

  const conclude = useCallback(() => {
    if (!result) {
      Alert.alert('Resultado da visita', 'Escolha um resultado antes de concluir.')
      return
    }
    if (result === 'NO_ORDER' && !noOrderReason.trim()) {
      Alert.alert('Motivo', 'Conte em uma linha por que não houve pedido — isso melhora as sugestões.')
      return
    }
    if (clientIdRef.current) {
      visits.setResult({
        clientId: clientIdRef.current,
        result,
        leftAt: new Date().toISOString(),
        noOrderReason: result === 'NO_ORDER' ? noOrderReason.trim() : null,
      })
      pilotTracker.track({ type: 'VISIT_RESULT', metadata: { result } })
    }
    router.back()
  }, [result, noOrderReason, visits, router])

  if (!item) {
    return (
      <View style={s.container} testID="screen-visita">
        <Text style={s.missing}>Parada não encontrada no plano de hoje.</Text>
      </View>
    )
  }

  return (
    <ScrollView testID="screen-visita" style={s.container} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.customerName}</Text>
          {item.customerAddress ? <Text style={s.address}>{item.customerAddress}</Text> : null}
        </View>
        <SyncPill />
      </View>
      <StatusPill status={item.statusAtTime} />

      {item.signals && (
        <BeforeEnterCard
          signals={item.signals}
          agentText={briefing.data?.text ?? null}
          testID="before-enter"
        />
      )}

      {item.suggestedOffer && item.suggestedOffer.length > 0 && (
        <View style={s.mixCard}>
          <Text style={s.mixTitle}>Mix sugerido</Text>
          {item.suggestedOffer.map((offer) => (
            <Text key={offer.productCode} style={s.mixLine}>
              • {offer.productDesc ?? offer.productCode}
              {offer.source === 'ask_about_cut' ? ' — perguntar (cortado)' : ''}
            </Text>
          ))}
          <TouchableOpacity testID="btn-iniciar-pedido" style={s.mixButton} onPress={startOrder}>
            <ShoppingCart size={14} color={colors.neutral.white} strokeWidth={1.5} />
            <Text style={s.mixButtonText}>Iniciar pedido com esse mix</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ações rápidas */}
      <View style={s.quickRow}>
        <TouchableOpacity
          style={s.quick}
          onPress={() => openMaps({ lat: item.lat, lng: item.lng, address: item.customerAddress })}
        >
          <Navigation size={15} color={colors.brand.primary} strokeWidth={1.5} />
          <Text style={s.quickText}>Navegar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.quick}
          onPress={() =>
            router.push({
              pathname: '/rota/mensagem/[customerKey]',
              params: { customerKey: `${item.customerCode}_${item.loja}` },
            })
          }
        >
          <MessageCircle size={15} color={colors.brand.primary} strokeWidth={1.5} />
          <Text style={s.quickText}>Mensagem</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.quick, !customerPhone && { opacity: 0.5 }]}
          disabled={!customerPhone}
          onPress={() => customerPhone && Linking.openURL(`tel:${customerPhone.replace(/\D/g, '')}`)}
        >
          <Phone size={15} color={colors.brand.primary} strokeWidth={1.5} />
          <Text style={s.quickText}>Ligar</Text>
        </TouchableOpacity>
      </View>

      {/* Resultado */}
      <Text style={s.sectionTitle}>Como foi a visita?</Text>
      <View style={s.resultGrid}>
        {RESULTS.map((option) => (
          <TouchableOpacity
            key={option.key}
            testID={`resultado-${option.key}`}
            style={[s.resultButton, result === option.key && s.resultButtonActive]}
            onPress={() => (option.key === 'ORDER' ? startOrder() : setResult(option.key))}
          >
            <Text style={[s.resultText, result === option.key && { color: colors.neutral.white }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {result === 'NO_ORDER' && (
        <TextInput
          testID="input-motivo"
          style={s.reasonInput}
          placeholder="Por quê? (ex.: estoque cheio, preço, comprou do concorrente)"
          placeholderTextColor={colors.neutral.placeholder}
          value={noOrderReason}
          onChangeText={setNoOrderReason}
          maxLength={200}
          multiline
        />
      )}

      <TouchableOpacity testID="btn-concluir-visita" style={s.conclude} onPress={conclude}>
        <Text style={s.concludeText}>Concluir visita</Text>
      </TouchableOpacity>

      <FreshnessFooter computedAt={plan?.freshness.lastSyncAt ?? null} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
  },
  address: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
  missing: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    padding: spacing.lg,
  },
  mixCard: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  mixTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  mixLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 19,
  },
  mixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  mixButtonText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    paddingVertical: spacing.sm,
  },
  quickText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
    marginTop: spacing.xs,
  },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resultButton: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    paddingVertical: spacing.md,
  },
  resultButtonActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  resultText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  reasonInput: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    minHeight: 64,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    textAlignVertical: 'top',
  },
  conclude: {
    alignItems: 'center',
    backgroundColor: colors.brand.dark,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  concludeText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.white,
  },
})
