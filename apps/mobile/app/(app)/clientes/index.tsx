import { useState } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useClientes } from '../../../src/hooks/useClientes'
import { useTheme } from '../../../src/theme'
import { ClienteItemSkeleton, EmptyState } from '../../../src/components/Skeleton'
import type { Customer } from '@addere/types'

function ClienteItem({ customer, onPress, theme }: { customer: Customer; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <TouchableOpacity style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: theme.text }]}>{customer.name}</Text>
        {customer.document && <Text style={[styles.doc, { color: theme.textMuted }]}>{customer.document}</Text>}
        {customer.phone && <Text style={[styles.sub, { color: theme.textMuted }]}>{customer.phone}</Text>}
      </View>
      <Text style={[styles.arrow, { color: theme.textMuted }]}>›</Text>
    </TouchableOpacity>
  )
}

export default function ClientesScreen() {
  const router  = useRouter()
  const theme   = useTheme()
  const [search, setSearch] = useState('')
  const { data: customers, isLoading, refetch } = useClientes(search || undefined)

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TextInput
        style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="Buscar por nome ou CPF/CNPJ..."
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

      {isLoading ? (
        <View style={{ paddingHorizontal: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => <ClienteItemSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ClienteItem
              customer={item}
              theme={theme}
              onPress={() => router.push(`/(app)/clientes/${item.id}`)}
            />
          )}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="people-outline" size={28} color={theme.textMuted} />}
              title={search ? 'Nenhum resultado' : 'Nenhum cliente ainda'}
              description={search ? `Não encontramos clientes para "${search}".` : 'Sincronize os clientes pelo painel web.'}
            />
          }
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: {
    margin: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  item: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  name:  { fontSize: 15, fontWeight: '600' },
  doc:   { fontSize: 12, marginTop: 2 },
  sub:   { fontSize: 12 },
  arrow: { fontSize: 22 },
})
