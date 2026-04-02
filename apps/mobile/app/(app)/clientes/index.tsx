import { useState } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useClientes } from '../../../src/hooks/useClientes'
import type { Customer } from '@addere/types'

function ClienteItem({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
      <View>
        <Text style={styles.name}>{customer.name}</Text>
        {customer.document && <Text style={styles.doc}>{customer.document}</Text>}
        {customer.phone && <Text style={styles.sub}>{customer.phone}</Text>}
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  )
}

export default function ClientesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const { data: customers, isLoading, refetch } = useClientes(search || undefined)

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar por nome ou CPF/CNPJ..."
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            <ClienteItem
              customer={item}
              onPress={() => router.push(`/(app)/clientes/${item.id}`)}
            />
          }
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum cliente encontrado.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  search: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 12,
    fontSize: 14,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  doc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sub: { fontSize: 12, color: '#6b7280' },
  arrow: { fontSize: 22, color: '#9ca3af' },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 40 },
})
