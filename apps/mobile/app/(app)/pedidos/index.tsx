import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Plus, RefreshCw } from 'lucide-react-native'
import { usePedidos, useSincronizarPedido } from '../../../src/hooks/usePedidos'
import { OrderRowSkeleton, EmptyState } from '../../../src/components/Skeleton'
import { Badge } from '../../../src/components/ui/Badge'
import type { Order } from '@addere/types'

type BadgeVariant = 'warning' | 'success' | 'danger' | 'neutral'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  PENDING:   'warning',
  SYNCED:    'success',
  CANCELLED: 'danger',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pendente',
  SYNCED:    'Sincronizado',
  CANCELLED: 'Cancelado',
}

function OrderCard({ order, syncingId, onSync, onPress }: {
  order: Order
  syncingId: string | null
  onSync: (id: string) => void
  onPress: () => void
}) {
  const variant = STATUS_BADGE[order.status] ?? 'neutral'
  const isSyncing = syncingId === order.id

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.customer}>{order.customer.name}</Text>
        <Text style={s.sub}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
        <Text style={s.sub}>{order.items.length} item(s)</Text>
        {order.protheusOrderId && (
          <Text style={s.protheusId}>Pedido Protheus: {order.protheusOrderId}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={s.total}>R$ {Number(order.total).toFixed(2)}</Text>
        <Badge variant={variant}>{STATUS_LABEL[order.status]}</Badge>
        {order.status === 'PENDING' && (
          <TouchableOpacity
            style={[s.syncBtn, isSyncing && { opacity: 0.5 }]}
            onPress={() => onSync(order.id)}
            disabled={isSyncing || syncingId !== null}
            activeOpacity={0.75}
          >
            {isSyncing
              ? <ActivityIndicator size={12} color="#fff" />
              : <RefreshCw size={12} color="#fff" strokeWidth={2} />
            }
            <Text style={s.syncBtnText}>{isSyncing ? 'Enviando...' : 'Sincronizar'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function PedidosScreen() {
  const router = useRouter()
  const { data: orders, isLoading, refetch } = usePedidos()
  const { mutate: sincronizar } = useSincronizarPedido()
  const [syncingId, setSyncingId] = React.useState<string | null>(null)

  function handleSync(orderId: string) {
    setSyncingId(orderId)
    sincronizar(orderId, {
      onSuccess: () => {
        setSyncingId(null)
        Alert.alert('Sucesso', 'Pedido enviado ao Protheus com sucesso!')
      },
      onError: (err: unknown) => {
        setSyncingId(null)
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Não foi possível sincronizar o pedido.'
        Alert.alert('Erro', msg)
      },
    })
  }

  return (
    <View style={s.container}>
      {isLoading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2, 3].map((i) => <OrderRowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              syncingId={syncingId}
              onSync={handleSync}
              onPress={() => router.push(`/(app)/pedidos/${item.id}`)}
            />
          )}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              icon={null}
              title="Nenhum pedido ainda"
              description="Toque no botão + para criar seu primeiro pedido."
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 90, gap: 8 }}
        />
      )}

      {/* FAB — Novo Pedido */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(app)/novo-pedido')}
        activeOpacity={0.85}
      >
        <Plus size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  customer: {
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
  total: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: '#0D2045',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1B4FA8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  protheusId: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#1B4FA8',
    marginTop: 3,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1B4FA8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B4FA8',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
})
