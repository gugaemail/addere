import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Plus, RefreshCw, SearchCheck } from 'lucide-react-native'
import {
  usePedidos,
  useSincronizarPedido,
  useConsultarStatusPedido,
} from '../../../src/hooks/usePedidos'
import { OrderRowSkeleton } from '../../../src/components/Skeleton'
import { Badge } from '../../../src/components/ui/Badge'
import { Button, buttonForeground } from '../../../src/components/ui/Button'
import { Card } from '../../../src/components/ui/Card'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { colors, spacing, radius, typography } from '../../../src/theme'
import { OrderSwipeActions } from '../../../src/components/OrderSwipeActions'
import { PdfPreviewModal } from '../../../src/components/PdfPreviewModal'
import { SyncStatusBar } from '../../../src/components/SyncStatusBar'
import type { Order } from '@addere/types'
import { fmtMoeda, fmtData } from '../../../src/utils/format'
import { STATUS_BADGE, STATUS_LABEL } from '../../../src/utils/orderStatus'
import { getApiErrorMessage } from '../../../src/lib/errors'

function OrderCard({
  order,
  syncingId,
  checkingId,
  onSync,
  onCheckStatus,
  onPress,
}: {
  order: Order
  syncingId: string | null
  checkingId: string | null
  onSync: (id: string) => void
  onCheckStatus: (id: string) => void
  onPress: () => void
}) {
  const variant = STATUS_BADGE[order.status] ?? 'neutral'
  const isSyncing = syncingId === order.id
  const isChecking = checkingId === order.id

  return (
    <Card onPress={onPress} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.customer}>{order.customer.name}</Text>
        <Text style={s.sub}>{fmtData(order.createdAt)}</Text>
        <Text style={s.sub}>{order.items.length} item(s)</Text>
        {order.protheusOrderId && (
          <Text style={s.protheusId}>Pedido Protheus: {order.protheusOrderId}</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.sm }}>
        <Text style={s.total}>R$ {fmtMoeda(order.total)}</Text>
        <Badge variant={variant}>{STATUS_LABEL[order.status]}</Badge>
        {order.status === 'PENDING' && (
          <Button
            size="xs"
            loading={isSyncing}
            disabled={syncingId !== null}
            onPress={() => onSync(order.id)}
            icon={<RefreshCw size={12} color={buttonForeground.primary} strokeWidth={1.5} />}
          >
            Sincronizar
          </Button>
        )}
        {order.status === 'SYNCED' && order.protheusOrderId && (
          <Button
            size="xs"
            variant="secondary"
            loading={isChecking}
            onPress={() => onCheckStatus(order.id)}
            icon={<SearchCheck size={12} color={buttonForeground.secondary} strokeWidth={1.5} />}
          >
            Ver Status
          </Button>
        )}
      </View>
    </Card>
  )
}

export default function PedidosScreen() {
  const router = useRouter()
  const { data: orders, isLoading, refetch } = usePedidos()
  const { mutate: sincronizar } = useSincronizarPedido()
  const { mutate: consultarStatus } = useConsultarStatusPedido()
  const [syncingId, setSyncingId] = React.useState<string | null>(null)
  const [checkingId, setCheckingId] = React.useState<string | null>(null)
  const [pdfOrder, setPdfOrder] = React.useState<Order | null>(null)
  const [showPdfModal, setShowPdfModal] = React.useState(false)

  function handleOpenPdf(order: Order) {
    setPdfOrder(order)
    setShowPdfModal(true)
  }

  function handleClosePdf() {
    setShowPdfModal(false)
  }

  function handleSync(orderId: string) {
    setSyncingId(orderId)
    sincronizar(orderId, {
      onSuccess: () => {
        setSyncingId(null)
        Alert.alert('Sucesso', 'Pedido enviado ao Protheus com sucesso!')
      },
      onError: (err: unknown) => {
        setSyncingId(null)
        Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível sincronizar o pedido.'))
      },
    })
  }

  function handleCheckStatus(orderId: string) {
    setCheckingId(orderId)
    consultarStatus(orderId, {
      onSuccess: (result) => {
        setCheckingId(null)
        Alert.alert(
          `Pedido ${result.protheusOrderId}`,
          `Status: ${result.status}\nCódigo: ${result.codigo}`
        )
      },
      onError: (err: unknown) => {
        setCheckingId(null)
        Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível consultar o status.'))
      },
    })
  }

  return (
    <View style={s.container}>
      <SyncStatusBar />
      {isLoading ? (
        <View style={{ padding: spacing.md }}>
          {[0, 1, 2, 3].map((i) => (
            <OrderRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderSwipeActions order={item} onPdf={handleOpenPdf}>
              <OrderCard
                order={item}
                syncingId={syncingId}
                checkingId={checkingId}
                onSync={handleSync}
                onCheckStatus={handleCheckStatus}
                onPress={() => router.push(`/(app)/pedidos/${item.id}`)}
              />
            </OrderSwipeActions>
          )}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              illustration="orders"
              title="Nenhum pedido ainda"
              subtitle="Toque no botão + para criar seu primeiro pedido."
            />
          }
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 88, gap: spacing.sm }}
        />
      )}

      {/* FAB — Novo Pedido */}
      <TouchableOpacity
        testID="btn-novo-pedido"
        style={s.fab}
        onPress={() => router.push('/(app)/novo-pedido')}
        activeOpacity={0.85}
      >
        <Plus size={28} color={colors.neutral.white} strokeWidth={1.5} />
      </TouchableOpacity>

      <PdfPreviewModal visible={showPdfModal} order={pdfOrder} onClose={handleClosePdf} />
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.bg,
  },
  card: {
    flexDirection: 'row',
  },
  customer: {
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
  total: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 16,
    color: colors.brand.dark,
  },
  protheusId: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.brand.primary,
    marginTop: spacing.xs,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
})
