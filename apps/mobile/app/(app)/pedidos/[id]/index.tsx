import React from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { RefreshCw, SearchCheck, Pencil } from 'lucide-react-native'
import { usePedido, useSincronizarPedido, useConsultarStatusPedido, useCancelarPedido } from '../../../src/hooks/usePedidos'
import { Badge } from '../../../src/components/ui/Badge'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import { useQueryClient } from '@tanstack/react-query'
import { fmtMoeda, formatDocument } from '../../../src/utils/format'

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

function fmtQtd(value: string | number) {
  const n = Number(value)
  return n % 1 === 0 ? String(n) : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: order, isLoading, error } = usePedido(id)
  const { mutate: sincronizar, isPending: isSyncing }       = useSincronizarPedido()
  const { mutate: consultarStatus, isPending: isChecking }  = useConsultarStatusPedido()
  const { mutate: cancelar, isPending: isCancelling }       = useCancelarPedido()

  const showTransportadora  = useFieldVisible('order.transportadora')
  const showCondPag         = useFieldVisible('order.condPag')
  const showEmissao         = useFieldVisible('order.emissao')
  const showMennota         = useFieldVisible('order.mennota')
  const showNotes           = useFieldVisible('order.notes')
  const showProtheusStatus  = useFieldVisible('order.protheusStatus')
  const showDiscount        = useFieldVisible('orderItem.discount')
  const showDescricao       = useFieldVisible('orderItem.descricao')
  const showLargura         = useFieldVisible('orderItem.largura')
  const showEspessura       = useFieldVisible('orderItem.espessura')
  const showEncolhimento    = useFieldVisible('orderItem.encolhimento')
  const showXcrav           = useFieldVisible('orderItem.xcrav')
  const showTara            = useFieldVisible('orderItem.tara')

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

  function handleCancelar() {
    Alert.alert(
      'Cancelar pedido',
      'O pedido não foi encontrado no Protheus. Deseja cancelar este pedido?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: () => cancelar(id, {
            onSuccess: () => Alert.alert('Pedido cancelado', 'O pedido foi cancelado com sucesso.'),
            onError: (err: unknown) => {
              const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Não foi possível cancelar o pedido.'
              Alert.alert('Erro', msg)
            },
          }),
        },
      ]
    )
  }

  function handleCheckStatus() {
    consultarStatus(id, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ['orders', id] })
        const naoEncontrado = result.status?.toLowerCase().includes('nao encontrado')
          || result.status?.toLowerCase().includes('não encontrado')
        if (naoEncontrado) {
          handleCancelar()
        } else {
          Alert.alert(`Pedido ${result.protheusOrderId}`, `Status: ${result.status}\nCódigo: ${result.codigo}`)
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Não foi possível consultar o status.'
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
        <InfoRow label="Cliente"         value={order.customer.name} />
        <InfoRow label="CNPJ/CPF"        value={formatDocument(order.customer.document)} />
        <InfoRow label="Filial"          value={order.branch?.name ?? null} />
        {showTransportadora && <InfoRow label="Transportadora"  value={order.transportadora?.nome ?? null} />}
        {showCondPag        && <InfoRow label="Cond. Pagamento" value={order.condPag?.nome ?? null} />}
        <InfoRow label="Data" value={new Date(order.createdAt).toLocaleDateString('pt-BR')} />
        {showEmissao && order.emissao && (
          <InfoRow label="Emissão" value={new Date(order.emissao).toLocaleDateString('pt-BR')} />
        )}
        {order.protheusOrderId && (
          <InfoRow label="Pedido Protheus" value={order.protheusOrderId} />
        )}
        {order.syncedAt && (
          <InfoRow label="Sincronizado em" value={new Date(order.syncedAt).toLocaleDateString('pt-BR')} />
        )}
        {showProtheusStatus && order.protheusStatus && (
          <InfoRow label="Status Protheus" value={order.protheusStatus} />
        )}
      </Section>

      <Section title={`Itens (${order.items.length})`}>
        {order.items.map((item, idx) => (
          <View key={item.id} style={[s.itemRow, idx < order.items.length - 1 && s.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{item.product.name}</Text>
              {showDescricao && item.descricao ? <Text style={s.itemDesc}>{item.descricao}</Text> : null}
              <Text style={s.itemDetail}>
                {fmtQtd(item.quantity)} {item.product.unit} × R$ {fmtMoeda(item.unitPrice)}
                {showDiscount && Number(item.discount) > 0 ? `  (${fmtQtd(item.discount)}% desc.)` : ''}
              </Text>
              {(showLargura || showEspessura || showTara) && (
                <Text style={s.itemDetail}>
                  {showLargura    && item.largura   ? `Larg: ${fmtQtd(item.largura)}  ` : ''}
                  {showEspessura  && item.espessura ? `Esp: ${fmtQtd(item.espessura)}  ` : ''}
                  {showTara       && item.tara      ? `Tara: ${fmtQtd(item.tara)}` : ''}
                </Text>
              )}
              {showEncolhimento && item.encolhimento ? <Text style={s.itemDesc}>Encolh: {item.encolhimento}</Text> : null}
              {showXcrav && item.xcrav ? <Text style={s.itemDesc}>Larg. Crav: {item.xcrav === '1' ? 'Sim' : 'Não'}</Text> : null}
            </View>
            <Text style={s.itemTotal}>R$ {fmtMoeda(item.total)}</Text>
          </View>
        ))}
      </Section>

      {showMennota && order.mennota ? (
        <Section title="Mensagem para Nota Fiscal">
          <Text style={s.notes}>{order.mennota}</Text>
        </Section>
      ) : null}

      {showNotes && order.notes ? (
        <Section title="Observação Interna">
          <Text style={s.notes}>{order.notes}</Text>
        </Section>
      ) : null}

      <View style={s.totalCard}>
        <Text style={s.totalLabel}>Total do pedido</Text>
        <Text style={s.totalValue}>R$ {fmtMoeda(order.total)}</Text>
      </View>

      {order.status === 'PENDING' && (
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => router.push(`/(app)/pedidos/${id}/editar` as never)}
          activeOpacity={0.8}
        >
          <Pencil size={16} color="#1B4FA8" strokeWidth={1.5} />
          <Text style={s.editBtnText}>Editar pedido</Text>
        </TouchableOpacity>
      )}

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

      {order.status === 'SYNCED' && order.protheusOrderId && (
        <TouchableOpacity
          style={[s.statusBtn, isChecking && { opacity: 0.6 }]}
          onPress={handleCheckStatus}
          disabled={isChecking}
          activeOpacity={0.8}
        >
          <SearchCheck size={16} color="#1B4FA8" strokeWidth={1.5} />
          <Text style={s.statusBtnText}>{isChecking ? 'Consultando...' : 'Atualizar Status Protheus'}</Text>
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
  itemName:   { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#0D2045' },
  itemDesc:   { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 1 },
  itemDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },
  itemTotal:  { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#0D2045' },
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
    marginBottom: 12,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: '#0D2045' },
  editBtn: {
    backgroundColor: '#E8F4FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1B4FA8',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  editBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#1B4FA8',
  },
  syncBtn: {
    backgroundColor: '#1B4FA8',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  syncBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  statusBtn: {
    backgroundColor: '#E8F4FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1B4FA8',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#1B4FA8',
  },
})
