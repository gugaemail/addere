import { useState } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { X } from 'lucide-react-native'
import { useProdutos } from '../../../src/hooks/useProdutos'
import { Badge } from '../../../src/components/ui/Badge'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import type { Product } from '@addere/types'
import { fmtMoeda } from '../../../src/utils/format'

function fmtQtd(value: number) {
  return value % 1 === 0
    ? value.toLocaleString('pt-BR')
    : value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

function ProductCard({ product }: { product: Product }) {
  const stockNum         = Number(product.stock)
  const showStock        = useFieldVisible('product.stock')
  const showDescription  = useFieldVisible('product.description')
  const showProtheusCode = useFieldVisible('product.protheusCode')
  return (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{product.name}</Text>
        {showProtheusCode && product.protheusCode && (
          <Text style={s.sub}>Cód: {product.protheusCode}</Text>
        )}
        {showDescription && product.description && (
          <Text style={s.desc} numberOfLines={2}>{product.description}</Text>
        )}
      </View>
      <View style={s.right}>
        <Text style={s.price}>R$ {fmtMoeda(Number(product.price))}</Text>
        <Text style={s.unit}>{product.unit}</Text>
        {showStock && (
          <Badge variant={stockNum > 0 ? 'success' : 'danger'}>
            {stockNum > 0 ? `${fmtQtd(stockNum)} em estoque` : 'Sem estoque'}
          </Badge>
        )}
      </View>
    </View>
  )
}

export default function ProdutosScreen() {
  const [search, setSearch] = useState('')
  const { data: products, isLoading, refetch } = useProdutos(search || undefined)

  return (
    <View style={s.container}>
      <View style={s.searchContainer}>
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nome ou código..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#94A3B8" strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#1B4FA8" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard product={item} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={s.empty}>Nenhum produto encontrado.</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0D2045',
    padding: 0,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
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
  desc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  price: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: '#0D2045',
  },
  unit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
  },
  empty: {
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 40,
    color: '#64748B',
  },
})
