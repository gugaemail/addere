import { useMemo, useState } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronRight, Search, X } from 'lucide-react-native'
import { useClientes } from '../../../src/hooks/useClientes'
import { useDebouncedValue } from '../../../src/hooks/useDebounce'
import { ClienteItemSkeleton } from '../../../src/components/Skeleton'
import { Card } from '../../../src/components/ui/Card'
import { Input } from '../../../src/components/ui/Input'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import { colors, spacing, typography } from '../../../src/theme'
import type { Customer, CustomerStatus } from '@addere/types'
import { formatDocument } from '../../../src/utils/format'
import { useCustomerSignals } from '../../../src/hooks/useIntel'
import { StatusPill } from '../../../src/components/intel/StatusPill'

function ClienteItem({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const showDocument = useFieldVisible('customer.document')
  const showPhone = useFieldVisible('customer.phone')
  return (
    <Card onPress={onPress} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{customer.name}</Text>
        {showDocument && customer.document && (
          <Text style={s.sub}>{formatDocument(customer.document)}</Text>
        )}
        {showPhone && customer.phone && <Text style={s.sub}>{customer.phone}</Text>}
      </View>
      <ChevronRight size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />
    </Card>
  )
}

const VALID_STATUSES: CustomerStatus[] = ['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']

export default function ClientesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { data: customers, isLoading, refetch } = useClientes(debouncedSearch || undefined)

  // Filtro por status do motor (E13): atalho "Quem está esfriando?" do Hoje
  const params = useLocalSearchParams<{ intelStatus?: string }>()
  const [statusFilter, setStatusFilter] = useState<CustomerStatus[] | null>(() => {
    const parsed = (params.intelStatus ?? '')
      .split(',')
      .filter((v): v is CustomerStatus => VALID_STATUSES.includes(v as CustomerStatus))
    return parsed.length > 0 ? parsed : null
  })
  const signals = useCustomerSignals()
  const filteredSignals = useMemo(() => {
    if (!statusFilter || !signals.data) return null
    return signals.data.items.filter((i) => statusFilter.includes(i.status))
  }, [statusFilter, signals.data])
  const idByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers ?? []) {
      if (c.protheusCode) map.set(`${c.protheusCode}|${c.loja ?? '01'}`, c.id)
    }
    return map
  }, [customers])

  return (
    <View style={s.container}>
      <View style={s.searchContainer}>
        <Input
          leftElement={<Search size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />}
          placeholder="Buscar por nome ou CPF/CNPJ..."
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {statusFilter && (
        <View style={s.filterBar}>
          <Text style={s.filterLabel}>Esfriando:</Text>
          {statusFilter.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
          <TouchableOpacity
            testID="btn-limpar-filtro"
            onPress={() => setStatusFilter(null)}
            hitSlop={8}
            style={{ marginLeft: 'auto' }}
          >
            <X size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>
      )}

      {statusFilter && filteredSignals ? (
        <FlatList
          data={filteredSignals}
          keyExtractor={(item) => `${item.customerCode}|${item.loja}`}
          renderItem={({ item }) => (
            <Card
              onPress={() => {
                const id = idByKey.get(`${item.customerCode}|${item.loja}`)
                if (id) router.push(`/(app)/clientes/${id}`)
              }}
              style={s.card}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.customerName}</Text>
                <Text style={s.sub}>
                  {item.daysSinceLastPurchase !== null
                    ? `${item.daysSinceLastPurchase} dias sem comprar`
                    : (item.reason ?? '')}
                </Text>
              </View>
              <StatusPill status={item.status} />
            </Card>
          )}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={
            <EmptyState
              illustration="clients"
              title="Ninguém esfriando"
              subtitle="Nenhum cliente da carteira está atrasado ou em risco."
            />
          }
        />
      ) : isLoading ? (
        <View style={{ padding: spacing.md }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <ClienteItemSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ClienteItem
              customer={item}
              onPress={() => router.push(`/(app)/clientes/${item.id}`)}
            />
          )}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              illustration="clients"
              title={search ? 'Nenhum resultado' : 'Nenhum cliente ainda'}
              subtitle={
                search
                  ? `Não encontramos clientes para "${search}".`
                  : 'Sincronize os clientes pelo painel web.'
              }
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterLabel: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  container: {
    flex: 1,
    backgroundColor: colors.neutral.bg,
  },
  searchContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
  },
  sub: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
})
