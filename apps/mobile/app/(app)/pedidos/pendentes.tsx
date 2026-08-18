import React from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { RefreshCw, AlertCircle, Clock, CheckCircle } from 'lucide-react-native'
import { useSyncQueue } from '../../../src/hooks/useSyncQueue'
import { Button, buttonForeground } from '../../../src/components/ui/Button'
import { Card } from '../../../src/components/ui/Card'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { colors, spacing } from '../../../src/theme'
import { fmtDataHora } from '../../../src/utils/format'
import type { SyncQueueItem } from '../../../src/types/sync'
import type { CreateOrderInput } from '@addere/types'

const STATUS_COLOR = {
  pending:  colors.semantic.muted,
  syncing:  colors.brand.primary,
  error:    colors.semantic.danger,
  synced:   colors.semantic.success,
} as const

const STATUS_LABEL = {
  pending:  'Pendente',
  syncing:  'Enviando...',
  error:    'Erro',
  synced:   'Sincronizado',
} as const

function getCustomerName(payload: unknown): string {
  try {
    const p = payload as CreateOrderInput
    return p.customerId ? `Cliente ID: ${p.customerId.slice(0, 8)}...` : '—'
  } catch {
    return '—'
  }
}

function QueueItemCard({
  item,
  onRetry,
}: {
  item: SyncQueueItem
  onRetry: (id: string) => void
}) {
  const color = STATUS_COLOR[item.status]
  const label = STATUS_LABEL[item.status]

  return (
    <Card>
      <View style={s.cardHeader}>
        <View style={s.statusRow}>
          {item.status === 'syncing' ? (
            <ActivityIndicator size={14} color={color} />
          ) : item.status === 'error' ? (
            <AlertCircle size={14} color={color} strokeWidth={1.5} />
          ) : item.status === 'synced' ? (
            <CheckCircle size={14} color={color} strokeWidth={1.5} />
          ) : (
            <Clock size={14} color={color} strokeWidth={1.5} />
          )}
          <Text style={[s.statusText, { color }]}>{label}</Text>
        </View>
        <Text style={s.date}>{fmtDataHora(item.createdAt)}</Text>
      </View>

      <Text style={s.customer}>{getCustomerName(item.payload)}</Text>

      {item.status === 'error' && (
        <>
          <Text style={s.error}>{item.lastError}</Text>
          <Text style={s.attempts}>
            Tentativas: {item.attempts}/{item.maxAttempts}
          </Text>
          {item.attempts < item.maxAttempts && (
            <Button
              testID={`retry-item-${item.id}`}
              variant="secondary"
              size="xs"
              style={s.retryBtn}
              onPress={() => onRetry(item.id)}
              icon={<RefreshCw size={12} color={buttonForeground.secondary} strokeWidth={1.5} />}
            >
              Reenviar
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

export default function PendentesScreen() {
  const {
    pendingItems,
    queue,
    isSyncing,
    errorItems,
    syncNow,
    retryItem,
    dismissSynced,
  } = useSyncQueue()

  const syncedItems = queue.filter((item) => item.status === 'synced')
  const activeItems = pendingItems

  function handleRetryAll() {
    Alert.alert(
      'Reenviar todos',
      'Deseja tentar reenviar todos os pedidos com erro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reenviar',
          onPress: () => {
            errorItems.forEach((item) => retryItem(item.id))
          },
        },
      ],
    )
  }

  const totalActive = activeItems.length

  return (
    <View style={s.container}>
      {totalActive > 0 && (
        <View style={s.countBadgeRow}>
          <Text testID="queue-count-badge" style={s.countBadge}>{String(totalActive)}</Text>
          <Text style={s.countLabel}> pedido{totalActive !== 1 ? 's' : ''} na fila</Text>
        </View>
      )}

      {errorItems.length > 0 && (
        <Button
          style={s.retryAllBtn}
          onPress={handleRetryAll}
          icon={<RefreshCw size={14} color={buttonForeground.primary} strokeWidth={1.5} />}
        >
          Reenviar todos com erro ({errorItems.length})
        </Button>
      )}

      <FlatList
        data={[...activeItems, ...syncedItems]}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View testID={`queue-item-${index}`}>
            <QueueItemCard item={item} onRetry={retryItem} />
          </View>
        )}
        onRefresh={syncNow}
        refreshing={isSyncing}
        ListEmptyComponent={
          <EmptyState
            testID="empty-queue-message"
            illustration="orders"
            title="Nenhum pedido pendente"
            subtitle="Todos os pedidos foram sincronizados."
          />
        }
        ListFooterComponent={
          syncedItems.length > 0 ? (
            <Button variant="ghost" size="sm" style={s.clearBtn} onPress={dismissSynced}>
              Limpar sincronizados ({syncedItems.length})
            </Button>
          ) : null
        }
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  countBadgeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  countBadge: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 20, color: colors.brand.dark },
  countLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.textSub },
  retryAllBtn: {
    margin: spacing.md,
    marginBottom: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.neutral.textSub },
  customer: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.brand.dark,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.semantic.danger,
    marginTop: spacing.xs,
  },
  attempts: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  retryBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  clearBtn: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
})
