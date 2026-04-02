import { useState } from 'react'
import { View, Text, FlatList, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import { useProdutos } from '../../../src/hooks/useProdutos'
import type { Product } from '@addere/types'

function ProductCard({ product }: { product: Product }) {
  const stockNum = Number(product.stock)
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{product.name}</Text>
        {product.protheusCode && (
          <Text style={styles.code}>Cód: {product.protheusCode}</Text>
        )}
        {product.description && (
          <Text style={styles.desc} numberOfLines={2}>{product.description}</Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>R$ {Number(product.price).toFixed(2)}</Text>
        <Text style={styles.unit}>{product.unit}</Text>
        <Text style={[styles.stock, { color: stockNum > 0 ? '#16a34a' : '#dc2626' }]}>
          Estoque: {stockNum}
        </Text>
      </View>
    </View>
  )
}

export default function ProdutosScreen() {
  const [search, setSearch] = useState('')
  const { data: products, isLoading, refetch } = useProdutos(search || undefined)

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar por nome ou código..."
        value={search}
        onChangeText={setSearch}
      />

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard product={item} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum produto encontrado.</Text>}
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  name: { fontSize: 14, fontWeight: '600', color: '#111827' },
  code: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  desc: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  right: { alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  price: { fontSize: 16, fontWeight: '700', color: '#2563eb' },
  unit: { fontSize: 11, color: '#9ca3af' },
  stock: { fontSize: 12, fontWeight: '600' },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 40 },
})
