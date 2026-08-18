import { useState } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { Search } from 'lucide-react-native'
import { useCatalog } from '../../../src/hooks/useCatalog'
import { useDebouncedValue } from '../../../src/hooks/useDebounce'
import { Badge } from '../../../src/components/ui/Badge'
import { Card } from '../../../src/components/ui/Card'
import { Input } from '../../../src/components/ui/Input'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { LoadingState } from '../../../src/components/Skeleton'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import { colors, spacing, typography } from '../../../src/theme'
import type { Product } from '@addere/types'
import { fmtMoeda, fmtQtd } from '../../../src/utils/format'

function ProductCard({ product }: { product: Product }) {
  const stockNum         = Number(product.stock)
  const showStock        = useFieldVisible('product.stock')
  const showDescription  = useFieldVisible('product.description')
  const showProtheusCode = useFieldVisible('product.protheusCode')
  return (
    <Card style={s.card}>
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
    </Card>
  )
}

export default function ProdutosScreen() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { data: products, isLoading, refetch } = useCatalog(debouncedSearch || undefined)

  return (
    <View style={s.container}>
      <View style={s.searchContainer}>
        <Input
          placeholder="Buscar por nome ou código..."
          value={search}
          onChangeText={setSearch}
          leftElement={<Search size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />}
          onClear={() => setSearch('')}
        />
      </View>

      {isLoading ? (
        <LoadingState style={{ marginTop: spacing.lg }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProductCard product={item} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <EmptyState
              illustration="products"
              title="Nenhum produto encontrado."
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
  },
  name: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 15,
    color: colors.brand.dark,
  },
  sub: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  desc: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  price: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 16,
    color: colors.brand.dark,
  },
  unit: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
  },
})
