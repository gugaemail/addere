import { useState } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, X } from 'lucide-react-native'
import { useClientes } from '../../../src/hooks/useClientes'
import { ClienteItemSkeleton, EmptyState } from '../../../src/components/Skeleton'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import type { Customer } from '@addere/types'

function formatDocument(doc: string | null | undefined): string | null {
  if (!doc) return null
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

function ClienteItem({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const showDocument = useFieldVisible('customer.document')
  const showPhone    = useFieldVisible('customer.phone')
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{customer.name}</Text>
        {showDocument && customer.document && <Text style={s.sub}>{formatDocument(customer.document)}</Text>}
        {showPhone    && customer.phone    && <Text style={s.sub}>{customer.phone}</Text>}
      </View>
      <ChevronRight size={18} color="#94A3B8" />
    </TouchableOpacity>
  )
}

export default function ClientesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const { data: customers, isLoading, refetch } = useClientes(search || undefined)

  return (
    <View style={s.container}>
      <View style={s.searchContainer}>
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nome ou CPF/CNPJ..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn} activeOpacity={0.7}>
            <X size={16} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>

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
              onPress={() => router.push(`/(app)/clientes/${item.id}`)}
            />
          )}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              icon={null}
              title={search ? 'Nenhum resultado' : 'Nenhum cliente ainda'}
              description={search ? `Não encontramos clientes para "${search}".` : 'Sincronize os clientes pelo painel web.'}
            />
          }
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchContainer: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0D2045',
  },
  clearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0D2045',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  name: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#0D2045',
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
})
