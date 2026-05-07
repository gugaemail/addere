import React from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, Stack } from 'expo-router'
import { RefreshCw } from 'lucide-react-native'
import { usePedido, useSincronizarPedido } from '../../../src/hooks/usePedidos'
import { Badge } from '../../../src/components/ui/Badge'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

export default function PedidoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: order, isLoading, error } = usePedido(id)
  const { mutate: sincronizar, isPending: isSyncing } = useSincronizarPedido()

  function handleSync() {
    sincronizar(id, {
      onSuccess: () => Alert.alert('Sucesso', 'Pedido enviado ao Protheus com sucesso!'),
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Não foi possível sincronizar o pedido.'
        Alert.alert('Erro', msg)
      },
    })
  }

  if (isLoading) {
    return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color="#1B4FA8" />
  }

  if (error || !order) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Pedido não encontrado.</Text>
      </View>
    )
  }

  const variant = STATUS_BADGE[order.status] ?? 'neutral'

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Stack.Screen options={{ title: order.customer.name }} />

      <Section title="Informações">
        <View style={s.statusRow}>
          <Badge variant={variant}>{STATUS_LABEL[order.status]}</Badge>
        </View>
        <InfoRow label="Cliente" value={order.customer.name} />
        <InfoRow label="CNPJ/CPF" value={order.customer.document} />
        <InfoRow label="Data" value={new Date(order.createdAt).toLocaleDateString('pt-BR')} />
        {order.emissao && (
          <InfoRow label="Emissão" value={new Date(order.emissao).toLocaleDateString('pt-BR')} />
        )}
        {order.protheusOrderId && (
          <InfoRow label="Pedido Protheus" value={order.protheusOrderId} />
        )}
        {order.syncedAt && (
          <InfoRow label="Sincronizado em" value={new Date(order.syncedAt).toLocaleDateString('pt-BR')} />
        )}
      </Section>

      <Section title={`Itens (${order.items.length})`}>
        {order.items.map((item, idx) => (
          <View key={item.id} style={[s.itemRow, idx < order.items.length - 1 && s.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{item.product.name}</Text>
              {item.descricao ? <Text style={s.itemDesc}>{item.descricao}</Text> : null}
              <Text style={s.itemDetail}>
                {Number(item.quantity)} {item.product.unit} × R$ {Number(item.unitPrice).toFixed(2)}
                {Number(item.discount) > 0 ? `  (${Number(item.discount)}% desc.)` : ''}
              </Text>
            </View>
            <Text style={s.itemTotal}>R$ {Number(item.total).toFixed(2)}</Text>
          </View>
        ))}
      </Section>

      {(order.notes || order.mennota) ? (
        <Section title="Observações">
          {order.notes ? <Text style={s.notes}>{order.notes}</Text> : null}
          {order.mennota ? <Text style={s.notes}>{order.mennota}</Text> : null}
        </Section>
      ) : null}

      <View style={s.totalCard}>
        <Text style={s.totalLabel}>Total do pedido</Text>
        <Text style={s.totalValue}>R$ {Number(order.total).toFixed(2)}</Text>
      </View>

      {order.status === 'PENDING' && (
        <TouchableOpacity
          style={[s.syncBtn, isSyncing && { opacity: 0.6 }]}
          onPress={handleSync}
          disabled={isSyncing}
          activeOpacity={0.8}
        >
          <RefreshCw size={16} color="#fff" strokeWidth={1.5} />
          <Text style={s.syncBtnText}>{isSyncing ? 'Enviando ao Protheus...' : 'Sincronizar com Protheus'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#EF4444', fontFamily: 'Inter_400Regular' },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#0D2045',
    marginBottom: 12,
  },
  statusRow: { marginBottom: 10 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#64748B' },
  infoValue: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#0D2045', maxWidth: '60%', textAlign: 'right' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 8,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#0D2045' },
  itemDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 1 },
  itemDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },
  itemTotal: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#0D2045' },
  notes: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#475569', lineHeight: 20 },
  totalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: '#0D2045' },
  syncBtn: {
    backgroundColor: '#1B4FA8',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
})
