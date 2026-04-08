import { useState } from 'react'
import { View, Text, FlatList, TextInput, ActivityIndicator, StyleSheet } from 'react-native'
import { useProdutos } from '../../../src/hooks/useProdutos'
import { useTheme } from '../../../src/theme'
import type { Product } from '@addere/types'

function ProductCard({ product, theme }: { product: Product; theme: ReturnType<typeof useTheme> }) {
  const stockNum = Number(product.stock)
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: theme.text }]}>{product.name}</Text>
        {product.protheusCode && (
          <Text style={[styles.code, { color: theme.textMuted }]}>Cód: {product.protheusCode}</Text>
        )}
        {product.description && (
          <Text style={[styles.desc, { color: theme.textSub }]} numberOfLines={2}>{product.description}</Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={[styles.price, { color: theme.brand }]}>R$ {Number(product.price).toFixed(2)}</Text>
        <Text style={[styles.unit, { color: theme.textMuted }]}>{product.unit}</Text>
        <Text style={[styles.stock, { color: stockNum > 0 ? '#16a34a' : '#dc2626' }]}>
          {stockNum > 0 ? `${stockNum} em estoque` : 'Sem estoque'}
        </Text>
      </View>
    </View>
  )
}

export default function ProdutosScreen() {
  const theme = useTheme()
  const [search, setSearch] = useState('')
  const { data: products, isLoading, refetch } = useProdutos(search || undefined)

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TextInput
        style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        placeholder="Buscar por nome ou código..."
        placeholderTextColor={theme.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      {isLoading ? (
        <ActivityIndicator color={theme.brand} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard product={item} theme={theme} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>Nenhum produto encontrado.</Text>
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
  card: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  name:  { fontSize: 14, fontWeight: '600' },
  code:  { fontSize: 11, marginTop: 2 },
  desc:  { fontSize: 12, marginTop: 4 },
  right: { alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  price: { fontSize: 16, fontWeight: '700' },
  unit:  { fontSize: 11 },
  stock: { fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 40 },
})
