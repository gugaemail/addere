// Carteira da equipe (tela B, E8 fase 2) — todos os clientes com sinal dos
// vendedores do gerente, filtrável por status e por vendedor. Diferença
// obrigatória da carteira do vendedor (rota/carteira.tsx): cada linha mostra
// de qual vendedor é o cliente — sem isso o gerente não sabe com quem falar.
import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import type { CustomerStatus } from '@addere/types'
import { useManagerHome } from '../../../src/hooks/useManager'
import { useTeamSignals, type TeamSignalListItem } from '../../../src/hooks/useIntel'
import { STATUS_LABELS, statusColor } from '../../../src/utils/customerStatus'
import { StatusPill } from '../../../src/components/intel/StatusPill'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { LoadingState } from '../../../src/components/Skeleton'
import { colors, spacing, radius, typography } from '../../../src/theme'

// Mesma ordem da carteira do vendedor — todas as seis chaves de
// CustomerStatus, sempre: nenhuma pode desaparecer dos filtros.
const STATUS_ORDER: CustomerStatus[] = ['ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'NEW', 'BLOCKED']

function daysLine(days: number | null): string | null {
  if (days === null) return null
  return `há ${days} dia${days === 1 ? '' : 's'}`
}

function ticketLine(value: string | null): string | null {
  const n = Number(value)
  if (value === null || !Number.isFinite(n)) return null
  return `${n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} médio`
}

function Chip({
  label,
  active,
  color,
  onPress,
  testID,
}: {
  label: string
  active: boolean
  color?: string
  onPress: () => void
  testID: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[s.chip, active && { backgroundColor: (color ?? colors.brand.primary) + '1F', borderColor: color ?? colors.brand.primary }]}
      accessibilityState={{ selected: active }}
    >
      {color && <View style={[s.chipDot, { backgroundColor: color }]} />}
      <Text style={[s.chipText, active && { color: color ?? colors.brand.primary }]}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function EquipeCarteiraScreen() {
  const params = useLocalSearchParams<{ status?: string }>()
  const paramStatus = params.status as CustomerStatus | undefined
  const [status, setStatus] = useState<CustomerStatus | undefined>(
    paramStatus && STATUS_ORDER.includes(paramStatus) ? paramStatus : undefined
  )
  const [vendorCode, setVendorCode] = useState<string | undefined>(undefined)

  const { data: home } = useManagerHome()
  const { data, isLoading } = useTeamSignals({ status, vendorCode })

  const sellers = home?.portfolio.bySeller ?? []
  const items = data?.items ?? []

  const renderItem = ({ item, index }: { item: TeamSignalListItem; index: number }) => {
    const days = daysLine(item.daysSinceLastPurchase)
    const ticket = ticketLine(item.avgTicket)
    return (
      <View style={s.card} testID={`carteira-equipe-item-${index + 1}`}>
        <View style={s.cardHeader}>
          <Text style={s.name} numberOfLines={1}>
            {item.customerName}
          </Text>
          <StatusPill status={item.status} />
        </View>
        <Text style={s.meta} numberOfLines={1}>
          {item.sellerName}
          {days ? ` · ${days}` : ''}
          {ticket ? ` · ${ticket}` : ''}
        </Text>
      </View>
    )
  }

  if (isLoading && !data) return <LoadingState style={s.container} />

  return (
    <View style={s.container} testID="screen-equipe-carteira">
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.customerCode}|${item.loja}`}
        renderItem={renderItem}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={s.header}>
            <View style={s.chipRow}>
              <Chip
                testID="chip-status-all"
                label="Todos"
                active={status === undefined}
                onPress={() => setStatus(undefined)}
              />
              {STATUS_ORDER.map((st) => (
                <Chip
                  key={st}
                  testID={`chip-status-${st}`}
                  label={STATUS_LABELS[st]}
                  color={statusColor(st)}
                  active={status === st}
                  onPress={() => setStatus(st)}
                />
              ))}
            </View>
            {sellers.length > 0 && (
              <View style={s.chipRow}>
                <Chip
                  testID="chip-vendor-all"
                  label="Todos os vendedores"
                  active={vendorCode === undefined}
                  onPress={() => setVendorCode(undefined)}
                />
                {sellers.map((seller) => (
                  <Chip
                    key={seller.vendorCode}
                    testID={`chip-vendor-${seller.vendorCode}`}
                    label={seller.sellerName}
                    active={vendorCode === seller.vendorCode}
                    onPress={() => setVendorCode(seller.vendorCode)}
                  />
                ))}
              </View>
            )}
            <Text style={s.countLine}>
              {items.length} cliente{items.length === 1 ? '' : 's'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            illustration="clients"
            title="Ninguém nesse recorte"
            subtitle="Nenhum cliente da equipe combina com os filtros escolhidos."
          />
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipDot: { width: 8, height: 8, borderRadius: radius.full },
  chipText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.neutral.text,
  },
  countLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  meta: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
})
