// Plano do dia (E13) — lista de paradas do ranking com edição, check-in e
// navegação. Toggle Lista/Mapa (mapa chega na E13b). Funciona do cache offline.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Check,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Navigation,
  User as UserIcon,
  X,
} from 'lucide-react-native'
import type { VisitPlanItemDto } from '@addere/types'
import { useAuthStore } from '../../../src/store/auth.store'
import { useSyncStore } from '../../../src/store/syncStore'
import { useClientes } from '../../../src/hooks/useClientes'
import { makePlanOp, prefetchBriefings, usePlan, usePlanPatch, useVisitMutation } from '../../../src/hooks/useIntel'
import { getVisitPosition } from '../../../src/services/location'
import { openMaps, openRouteInMaps } from '../../../src/services/navigationLinks'
import { pilotTracker } from '../../../src/services/pilotTracking'
import { activeAddresses } from '../../../src/utils/intelText'
import { generateUuid } from '../../../src/utils/uuid'
import { StatusPill } from '../../../src/components/intel/StatusPill'
import { PlanMap } from '../../../src/components/intel/PlanMap'
import { unmappedCount } from '../../../src/utils/mapRegion'
import { SyncPill } from '../../../src/components/intel/SyncPill'
import { FreshnessFooter } from '../../../src/components/intel/FreshnessFooter'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { colors, spacing, radius, typography } from '../../../src/theme'

export default function RotaScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { data: plan, isLoading } = usePlan()
  const planPatch = usePlanPatch()
  const visits = useVisitMutation()
  const { data: customers } = useClientes()
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [selectedItem, setSelectedItem] = useState<VisitPlanItemDto | null>(null)
  // Pino cheio = visita registrada NESTE aparelho (fila de sync, E13b)
  const visitedItemIds = useSyncStore((state) => {
    const ids = new Set<string>()
    for (const entry of state.queue) {
      if (entry.type !== 'visit') continue
      const planItemId = (entry.payload as { planItemId?: string | null })?.planItemId
      if (planItemId) ids.add(planItemId)
    }
    return ids
  })

  useEffect(() => {
    prefetchBriefings(plan)
    if (plan) {
      pilotTracker.track({
        type: 'PLAN_OPENED',
        metadata: { itemCount: plan.items.filter((i) => !i.removedAt).length },
      })
    }
    // Track 1× por plano carregado — id cobre regeneração diária
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id])

  // Ficha precisa do id do banco — resolve pelo código/loja na lista em cache
  const customerIdByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers ?? []) {
      if (c.protheusCode) map.set(`${c.protheusCode}|${c.loja ?? '01'}`, c.id)
    }
    return map
  }, [customers])

  const active = useMemo(
    () => (plan?.items ?? []).filter((i) => !i.removedAt && i.statusAtTime !== 'BLOCKED'),
    [plan]
  )
  const blocked = useMemo(
    () => (plan?.items ?? []).filter((i) => !i.removedAt && i.statusAtTime === 'BLOCKED'),
    [plan]
  )

  // Pergunta única "qual cidade hoje?" — só com 2+ cidades atendidas e plano gerado
  const cities = user?.servedCities ?? []
  const [cityAsked, setCityAsked] = useState(false)
  const showCityQuestion =
    !cityAsked && cities.length > 1 && !!plan && plan.status === 'GENERATED'

  const pickCity = useCallback(
    (city: string) => {
      if (plan) planPatch.apply(plan.id, [makePlanOp({ type: 'setGrouping', grouping: city })])
      setCityAsked(true)
      pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
    },
    [plan, planPatch]
  )

  const move = useCallback(
    (item: VisitPlanItemDto, direction: -1 | 1) => {
      if (!plan) return
      const position = Math.max(1, item.position + direction)
      planPatch.apply(plan.id, [makePlanOp({ type: 'reorder', itemId: item.id, position })])
      pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
    },
    [plan, planPatch]
  )

  const removeFromDay = useCallback(
    (item: VisitPlanItemDto) => {
      if (!plan) return
      Alert.alert('Tirar do dia', `Tirar ${item.customerName} do plano de hoje?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Tirar',
          style: 'destructive',
          onPress: () => {
            planPatch.apply(plan.id, [makePlanOp({ type: 'remove', itemId: item.id })])
            pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
          },
        },
      ])
    },
    [plan, planPatch]
  )

  // Cheguei: registra a visita na fila (GPS 5s, nunca bloqueia) e abre a tela
  const checkIn = useCallback(
    async (item: VisitPlanItemDto) => {
      const clientId = generateUuid()
      const position = await getVisitPosition()
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
      router.push({ pathname: '/rota/visita/[itemId]', params: { itemId: item.id, clientId } })
    },
    [visits, router]
  )

  const openFicha = useCallback(
    (item: VisitPlanItemDto) => {
      const id = customerIdByKey.get(`${item.customerCode}|${item.loja}`)
      // withAnchor: a aba Clientes ainda pode não estar montada — sem isso a
      // pilha nasce na ficha, sem lista embaixo e sem Voltar (decisão 5)
      if (id) router.push({ pathname: '/clientes/[id]', params: { id } }, { withAnchor: true })
      else router.push('/clientes')
    },
    [customerIdByKey, router]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: VisitPlanItemDto; index: number }) => {
      const isBlocked = item.statusAtTime === 'BLOCKED'
      // Visita registrada neste aparelho: o card diz "Visitado" em vez de
      // oferecer "Cheguei" de novo — antes só o pino do mapa mudava.
      const isVisited = visitedItemIds.has(item.id)
      return (
        <View style={s.card} testID={`plan-item-${index + 1}`}>
          <View style={s.cardHeader}>
            <View style={[s.position, isBlocked && { backgroundColor: colors.status.blocked }]}>
              <Text style={s.positionText}>{isBlocked ? '!' : item.position}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>
                {item.customerName}
              </Text>
              {item.customerAddress ? (
                <Text style={s.address} numberOfLines={1}>
                  {item.customerAddress}
                </Text>
              ) : null}
            </View>
            <StatusPill status={item.statusAtTime} />
          </View>

          {item.shortReason ? <Text style={s.reason}>{item.shortReason}</Text> : null}

          {item.suggestedOffer && item.suggestedOffer.length > 0 && (
            <View style={s.offerRow}>
              {item.suggestedOffer.slice(0, 3).map((offer) => (
                <View
                  key={offer.productCode}
                  style={[s.offerChip, offer.source === 'ask_about_cut' && s.offerChipCut]}
                >
                  <Text style={s.offerText} numberOfLines={1}>
                    {offer.source === 'ask_about_cut' ? '? ' : ''}
                    {offer.productDesc ?? offer.productCode}
                  </Text>
                </View>
              ))}
              <Text style={s.offerHint}>confirme disponibilidade</Text>
            </View>
          )}

          <View style={s.actions}>
            <TouchableOpacity
              style={s.action}
              onPress={() => openMaps({ lat: item.lat, lng: item.lng, address: item.customerAddress })}
            >
              <Navigation size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.actionText}>Navegar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.action} onPress={() => openFicha(item)}>
              <UserIcon size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.actionText}>Ficha</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.action}
              onPress={() =>
                router.push({
                  pathname: '/rota/mensagem/[customerKey]',
                  params: { customerKey: `${item.customerCode}_${item.loja}` },
                })
              }
            >
              <MessageCircle size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.actionText}>Mensagem</Text>
            </TouchableOpacity>
            {!isBlocked && isVisited && (
              <View style={[s.action, s.actionDone]} testID={`badge-visitado-${index + 1}`}>
                <Check size={14} color={colors.semantic.success} strokeWidth={1.5} />
                <Text style={[s.actionText, s.actionDoneText]}>Visitado</Text>
              </View>
            )}
            {!isBlocked && !isVisited && (
              <TouchableOpacity
                testID={`btn-cheguei-${index + 1}`}
                style={[s.action, s.actionPrimary]}
                onPress={() => checkIn(item)}
              >
                <Text style={[s.actionText, { color: colors.neutral.white }]}>Cheguei</Text>
              </TouchableOpacity>
            )}
          </View>

          {!isBlocked && (
            <View style={s.editRow}>
              <TouchableOpacity onPress={() => move(item, -1)} hitSlop={8} disabled={item.position <= 1}>
                <ChevronUp
                  size={16}
                  color={item.position <= 1 ? colors.neutral.disabled : colors.neutral.textSub}
                  strokeWidth={1.5}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => move(item, 1)} hitSlop={8}>
                <ChevronDown size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
              </TouchableOpacity>
              <TouchableOpacity
                testID={`btn-tirar-${index + 1}`}
                onPress={() => removeFromDay(item)}
                hitSlop={8}
                style={{ marginLeft: 'auto' }}
              >
                <X size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )
    },
    [checkIn, move, openFicha, removeFromDay, router, visitedItemIds]
  )

  if (!isLoading && !plan) {
    return (
      <View style={s.container} testID="screen-rota">
        <EmptyState
          illustration="orders"
          title="Sem plano para hoje"
          subtitle="O plano do dia é calculado de madrugada pelo motor da Inteligência."
        />
      </View>
    )
  }

  return (
    <View style={s.container} testID="screen-rota">
      <View style={s.headerRow}>
        <View style={s.toggle}>
          <TouchableOpacity
            style={[s.toggleItem, view === 'lista' && s.toggleActive]}
            onPress={() => setView('lista')}
          >
            <Text style={[s.toggleText, view === 'lista' && s.toggleTextActive]}>Lista</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="toggle-mapa"
            style={[s.toggleItem, view === 'mapa' && s.toggleActive]}
            onPress={() => setView('mapa')}
          >
            <Text style={[s.toggleText, view === 'mapa' && s.toggleTextActive]}>Mapa</Text>
          </TouchableOpacity>
        </View>
        <SyncPill />
      </View>

      {showCityQuestion && (
        <View style={s.cityCard}>
          <Text style={s.cityTitle}>Qual cidade hoje?</Text>
          <View style={s.cityRow}>
            {cities.map((city) => (
              <TouchableOpacity key={city} style={s.cityChip} onPress={() => pickCity(city)}>
                <Text style={s.cityChipText}>{city}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {view === 'mapa' ? (
        <View style={s.mapContainer}>
          <PlanMap
            items={plan?.items ?? []}
            visitedItemIds={visitedItemIds}
            selectedId={selectedItem?.id ?? null}
            onSelect={setSelectedItem}
          />
          {unmappedCount(plan?.items ?? []) > 0 && (
            <TouchableOpacity
              testID="chip-sem-posicao"
              style={s.unmappedChip}
              onPress={() => setView('lista')}
            >
              <Text style={s.unmappedText}>
                {unmappedCount(plan?.items ?? [])} sem posição — ver na lista
              </Text>
            </TouchableOpacity>
          )}
          {!selectedItem && active.length > 1 && (
            <TouchableOpacity
              testID="btn-rota-completa-mapa"
              style={s.mapRouteButton}
              onPress={() => openRouteInMaps(activeAddresses(plan))}
            >
              <Navigation size={14} color={colors.neutral.white} strokeWidth={1.5} />
              <Text style={s.mapRouteText}>Abrir rota completa</Text>
            </TouchableOpacity>
          )}
          {selectedItem && (
            <View style={s.stopCard} testID="map-stop-card">
              <View style={s.cardHeader}>
                <View style={s.position}>
                  <Text style={s.positionText}>{selectedItem.position}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {selectedItem.customerName}
                  </Text>
                  {selectedItem.customerAddress ? (
                    <Text style={s.address} numberOfLines={1}>
                      {selectedItem.customerAddress}
                    </Text>
                  ) : null}
                </View>
                <StatusPill status={selectedItem.statusAtTime} />
              </View>
              <View style={s.actions}>
                <TouchableOpacity
                  style={s.action}
                  onPress={() =>
                    openMaps({
                      lat: selectedItem.lat,
                      lng: selectedItem.lng,
                      address: selectedItem.customerAddress,
                    })
                  }
                >
                  <Navigation size={14} color={colors.brand.primary} strokeWidth={1.5} />
                  <Text style={s.actionText}>Navegar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.action} onPress={() => openFicha(selectedItem)}>
                  <UserIcon size={14} color={colors.brand.primary} strokeWidth={1.5} />
                  <Text style={s.actionText}>Ficha</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.action}
                  onPress={() => {
                    if (plan) {
                      planPatch.apply(plan.id, [
                        makePlanOp({ type: 'skip', itemId: selectedItem.id }),
                      ])
                      pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
                    }
                    setSelectedItem(null)
                  }}
                >
                  <X size={14} color={colors.brand.primary} strokeWidth={1.5} />
                  <Text style={s.actionText}>Pular</Text>
                </TouchableOpacity>
                {selectedItem.statusAtTime !== 'BLOCKED' && (
                  <TouchableOpacity
                    style={[s.action, s.actionPrimary]}
                    onPress={() => checkIn(selectedItem)}
                  >
                    <Text style={[s.actionText, { color: colors.neutral.white }]}>Cheguei</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      ) : (
      <FlatList
        data={[...active, ...blocked]}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          blocked.length > 0 || active.length > 0 ? (
            <Text style={s.countLine}>
              {active.length} visita(s)
              {blocked.length > 0 ? ` · ${blocked.length} bloqueado(s) para resolver` : ''}
            </Text>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: spacing.sm }}>
            {active.length > 1 && (
              <TouchableOpacity
                testID="btn-rota-completa"
                style={s.fullRoute}
                onPress={() => openRouteInMaps(activeAddresses(plan))}
              >
                <Navigation size={14} color={colors.brand.primary} strokeWidth={1.5} />
                <Text style={s.fullRouteText}>Abrir rota completa no Maps</Text>
              </TouchableOpacity>
            )}
            <FreshnessFooter computedAt={plan?.freshness.lastSyncAt ?? null} />
          </View>
        }
      />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  mapContainer: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  unmappedChip: {
    position: 'absolute',
    top: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.brand.dark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  unmappedText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.neutral.white,
  },
  mapRouteButton: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  mapRouteText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  stopCard: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.full,
    padding: 3,
  },
  toggleItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  toggleActive: { backgroundColor: colors.neutral.white },
  toggleText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  toggleTextActive: { color: colors.brand.primary },
  cityCard: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cityTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.dark,
  },
  cityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cityChip: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.brand.primary,
  },
  cityChipText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
  countLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  position: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.brand.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    fontFamily: typography.fontFamily.bodyBold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  name: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  address: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  reason: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 19,
  },
  offerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  offerChip: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: 150,
  },
  offerChipCut: { backgroundColor: colors.semantic.warning + '1F' },
  offerText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.text,
  },
  offerHint: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.placeholder,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionPrimary: { backgroundColor: colors.brand.primary, marginLeft: 'auto' },
  actionDone: { backgroundColor: colors.semantic.successLight, marginLeft: 'auto' },
  actionDoneText: { color: colors.semantic.success },
  actionText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.brand.primary,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.subtle,
    paddingTop: spacing.sm,
  },
  fullRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  fullRouteText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
})
