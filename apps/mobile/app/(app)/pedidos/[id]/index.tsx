import React from 'react'
import { View, Text, ScrollView, StyleSheet, Alert, type ViewProps } from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { RefreshCw, SearchCheck, Pencil } from 'lucide-react-native'
import {
  usePedido,
  useSincronizarPedido,
  useConsultarStatusPedido,
  useCancelarPedido,
} from '../../../../src/hooks/usePedidos'
import { Badge } from '../../../../src/components/ui/Badge'
import { Button, buttonForeground } from '../../../../src/components/ui/Button'
import { Card } from '../../../../src/components/ui/Card'
import { LoadingState } from '../../../../src/components/Skeleton'
import { colors, spacing, typography } from '../../../../src/theme'
import { useFieldVisible } from '../../../../src/hooks/useFieldConfig'
import { useQueryClient } from '@tanstack/react-query'
import { fmtMoeda, fmtQtd, fmtData, formatDocument } from '../../../../src/utils/format'
import { STATUS_BADGE, STATUS_LABEL } from '../../../../src/utils/orderStatus'
import { getApiErrorMessage } from '../../../../src/lib/errors'
import { useIsManager } from '../../../../src/hooks/useProfile'

function Section({ title, children }: { title: string; children: ViewProps['children'] }) {
  return (
    <Card style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </Card>
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
  const { mutate: sincronizar, isPending: isSyncing } = useSincronizarPedido()
  const { mutate: consultarStatus, isPending: isChecking } = useConsultarStatusPedido()
  const { mutate: cancelar } = useCancelarPedido()
  // Gerente vê os pedidos da equipe, mas não edita nem cancela: isso é do dono
  const isManager = useIsManager()

  const showTransportadora = useFieldVisible('order.transportadora')
  const showCondPag = useFieldVisible('order.condPag')
  const showEmissao = useFieldVisible('order.emissao')
  const showMennota = useFieldVisible('order.mennota')
  const showNotes = useFieldVisible('order.notes')
  const showProtheusStatus = useFieldVisible('order.protheusStatus')
  const showDiscount = useFieldVisible('orderItem.discount')
  const showDescricao = useFieldVisible('orderItem.descricao')
  const showLargura = useFieldVisible('orderItem.largura')
  const showEspessura = useFieldVisible('orderItem.espessura')
  const showEncolhimento = useFieldVisible('orderItem.encolhimento')
  const showXcrav = useFieldVisible('orderItem.xcrav')
  const showTara = useFieldVisible('orderItem.tara')

  function handleSync() {
    sincronizar(id, {
      onSuccess: () => Alert.alert('Sucesso', 'Pedido enviado ao Protheus com sucesso!'),
      onError: (err: unknown) => {
        Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível sincronizar o pedido.'))
      },
    })
  }

  function handleCancelar() {
    if (isManager) {
      Alert.alert(
        'Pedido não encontrado',
        'O Protheus não encontrou este pedido. Só o vendedor que o criou pode cancelá-lo.'
      )
      return
    }
    Alert.alert(
      'Cancelar pedido',
      'O pedido não foi encontrado no Protheus. Deseja cancelar este pedido?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: () =>
            cancelar(id, {
              onSuccess: () =>
                Alert.alert('Pedido cancelado', 'O pedido foi cancelado com sucesso.'),
              onError: (err: unknown) => {
                Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível cancelar o pedido.'))
              },
            }),
        },
      ]
    )
  }

  function handleCheckStatus() {
    consultarStatus(id, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: ['orders', 'detail', id] })
        const naoEncontrado =
          result.status?.toLowerCase().includes('nao encontrado') ||
          result.status?.toLowerCase().includes('não encontrado')
        if (naoEncontrado) {
          handleCancelar()
        } else {
          Alert.alert(
            `Pedido ${result.protheusOrderId}`,
            `Status: ${result.status}\nCódigo: ${result.codigo}`
          )
        }
      },
      onError: (err: unknown) => {
        Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível consultar o status.'))
      },
    })
  }

  if (isLoading) {
    return <LoadingState />
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
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Stack.Screen options={{ title: order.customer.name }} />

      <Section title="Informações">
        <View style={s.statusRow}>
          <Badge variant={variant}>{STATUS_LABEL[order.status]}</Badge>
        </View>
        <InfoRow label="Cliente" value={order.customer.name} />
        {isManager && order.user && <InfoRow label="Vendedor" value={order.user.name} />}
        <InfoRow label="CNPJ/CPF" value={formatDocument(order.customer.document)} />
        <InfoRow label="Filial" value={order.branch?.name ?? null} />
        {showTransportadora && (
          <InfoRow label="Transportadora" value={order.transportadora?.nome ?? null} />
        )}
        {showCondPag && <InfoRow label="Cond. Pagamento" value={order.condPag?.nome ?? null} />}
        <InfoRow label="Data" value={fmtData(order.createdAt)} />
        {showEmissao && order.emissao && <InfoRow label="Emissão" value={fmtData(order.emissao)} />}
        {order.protheusOrderId && <InfoRow label="Pedido Protheus" value={order.protheusOrderId} />}
        {order.syncedAt && <InfoRow label="Sincronizado em" value={fmtData(order.syncedAt)} />}
        {showProtheusStatus && order.protheusStatus && (
          <InfoRow label="Status Protheus" value={order.protheusStatus} />
        )}
      </Section>

      <Section title={`Itens (${order.items.length})`}>
        {order.items.map((item, idx) => (
          <View key={item.id} style={[s.itemRow, idx < order.items.length - 1 && s.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{item.product.name}</Text>
              {showDescricao && item.descricao ? (
                <Text style={s.itemDesc}>{item.descricao}</Text>
              ) : null}
              <Text style={s.itemDetail}>
                {fmtQtd(item.quantity)} {item.product.unit} × R$ {fmtMoeda(item.unitPrice)}
                {showDiscount && Number(item.discount) > 0
                  ? `  (${fmtQtd(item.discount)}% desc.)`
                  : ''}
              </Text>
              {(showLargura || showEspessura || showTara) && (
                <Text style={s.itemDetail}>
                  {showLargura && item.largura ? `Larg: ${fmtQtd(item.largura)}  ` : ''}
                  {showEspessura && item.espessura ? `Esp: ${fmtQtd(item.espessura)}  ` : ''}
                  {showTara && item.tara ? `Tara: ${fmtQtd(item.tara)}` : ''}
                </Text>
              )}
              {showEncolhimento && item.encolhimento ? (
                <Text style={s.itemDesc}>Encolh: {item.encolhimento}</Text>
              ) : null}
              {showXcrav && item.xcrav ? (
                <Text style={s.itemDesc}>Larg. Crav: {item.xcrav === '1' ? 'Sim' : 'Não'}</Text>
              ) : null}
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

      <Card style={s.totalCard}>
        <Text style={s.totalLabel}>Total do pedido</Text>
        <Text style={s.totalValue}>R$ {fmtMoeda(order.total)}</Text>
      </Card>

      {order.status === 'PENDING' && !isManager && (
        <Button
          variant="secondary"
          size="lg"
          style={s.actionBtn}
          onPress={() => router.push(`/(app)/pedidos/${id}/editar` as never)}
          icon={<Pencil size={16} color={buttonForeground.secondary} strokeWidth={1.5} />}
        >
          Editar pedido
        </Button>
      )}

      {order.status === 'PENDING' && (
        <Button
          size="lg"
          style={s.actionBtn}
          onPress={handleSync}
          loading={isSyncing}
          icon={<RefreshCw size={16} color={buttonForeground.primary} strokeWidth={1.5} />}
        >
          Sincronizar com Protheus
        </Button>
      )}

      {order.status === 'SYNCED' && order.protheusOrderId && (
        <Button
          variant="secondary"
          size="lg"
          style={s.actionBtn}
          onPress={handleCheckStatus}
          loading={isChecking}
          icon={<SearchCheck size={16} color={buttonForeground.secondary} strokeWidth={1.5} />}
        >
          Atualizar Status Protheus
        </Button>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.semantic.danger, fontFamily: typography.fontFamily.body },
  section: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 14,
    color: colors.brand.dark,
    marginBottom: spacing.sm,
  },
  statusRow: { marginBottom: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.subtle,
  },
  infoLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.neutral.textSub,
  },
  infoValue: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.brand.dark,
    maxWidth: '60%',
    textAlign: 'right',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.subtle,
  },
  itemName: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 14,
    color: colors.brand.dark,
  },
  itemDesc: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  itemDetail: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  itemTotal: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 14,
    color: colors.brand.dark,
  },
  notes: {
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.neutral.text,
    lineHeight: 20,
  },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  totalLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: colors.neutral.textSub,
  },
  totalValue: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 22,
    color: colors.brand.dark,
  },
  actionBtn: {
    marginBottom: spacing.sm,
  },
})
