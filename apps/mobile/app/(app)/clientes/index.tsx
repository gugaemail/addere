import { useState } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Search } from 'lucide-react-native'
import { useClientes } from '../../../src/hooks/useClientes'
import { useDebouncedValue } from '../../../src/hooks/useDebounce'
import { ClienteItemSkeleton } from '../../../src/components/Skeleton'
import { Card } from '../../../src/components/ui/Card'
import { Input } from '../../../src/components/ui/Input'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import { colors, spacing, typography } from '../../../src/theme'
import type { Customer } from '@addere/types'
import { formatDocument } from '../../../src/utils/format'

function ClienteItem({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const showDocument = useFieldVisible('customer.document')
  const showPhone    = useFieldVisible('customer.phone')
  return (
    <Card onPress={onPress} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{customer.name}</Text>
        {showDocument && customer.document && <Text style={s.sub}>{formatDocument(customer.document)}</Text>}
        {showPhone    && customer.phone    && <Text style={s.sub}>{customer.phone}</Text>}
      </View>
      <ChevronRight size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />
    </Card>
  )
}

export default function ClientesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { data: customers, isLoading, refetch } = useClientes(debouncedSearch || undefined)

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

      {isLoading ? (
        <View style={{ padding: spacing.md }}>
          {[0, 1, 2, 3, 4].map((i) => <ClienteItemSkeleton key={i} />)}
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
              subtitle={search ? `Não encontramos clientes para "${search}".` : 'Sincronize os clientes pelo painel web.'}
            />
          }
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
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
