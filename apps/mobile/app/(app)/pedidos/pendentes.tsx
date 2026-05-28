import React from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { RefreshCw, AlertCircle, Clock, CheckCircle } from 'lucide-react-native'
import { useSyncQueue } from '../../../src/hooks/useSyncQueue'
import type { SyncQueueItem } from '../../../src/types/sync'
import type { CreateOrderInput } from '@addere/types'

const STATUS_COLOR = {
  pending:  '#64748B',
  syncing:  '#1B4FA8',
  error:    '#EF4444',
  synced:   '#22C55E',
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
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
    <View style={s.card}>
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
        <Text style={s.date}>{formatDate(item.createdAt)}</Text>
      </View>

      <Text style={s.customer}>{getCustomerName(item.payload)}</Text>

      {item.status === 'error' && (
        <>
          <Text style={s.error}>{item.lastError}</Text>
          <Text style={s.attempts}>
            Tentativas: {item.attempts}/{item.maxAttempts}
          </Text>
          {item.attempts < item.maxAttempts && (
            <TouchableOpacity
              testID={`retry-item-${item.id}`}
              style={s.retryBtn}
              onPress={() => onRetry(item.id)}
              activeOpacity={0.8}
            >
              <RefreshCw size={12} color="#1B4FA8" strokeWidth={1.5} />
              <Text style={s.retryBtnText}>Reenviar</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
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
        <TouchableOpacity style={s.retryAllBtn} onPress={handleRetryAll} activeOpacity={0.85}>
          <RefreshCw size={14} color="#FFFFFF" strokeWidth={1.5} />
          <Text style={s.retryAllText}>Reenviar todos com erro ({errorItems.length})</Text>
        </TouchableOpacity>
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
          <View testID="empty-queue-message" style={s.empty}>
            <CheckCircle size={40} color="#22C55E" strokeWidth={1.5} />
            <Text style={s.emptyTitle}>Nenhum pedido pendente</Text>
            <Text style={s.emptyDesc}>Todos os pedidos foram sincronizados.</Text>
          </View>
        }
        ListFooterComponent={
          syncedItems.length > 0 ? (
            <TouchableOpacity style={s.clearBtn} onPress={dismissSynced} activeOpacity={0.8}>
              <Text style={s.clearBtnText}>Limpar sincronizados ({syncedItems.length})</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  countBadgeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  countBadge: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 20, color: '#0D2045' },
  countLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },
  retryAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#1B4FA8',
    borderRadius: 10,
    padding: 12,
  },
  retryAllText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#94A3B8' },
  customer: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#0D2045',
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  attempts: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#1B4FA8',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#1B4FA8',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: '#0D2045',
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748B',
  },
  clearBtn: {
    marginTop: 16,
    alignSelf: 'center',
    padding: 8,
  },
  clearBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#64748B',
    textDecorationLine: 'underline',
  },
})
