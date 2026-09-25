// Mensagem (E13) — 3 moldes, texto editável, WhatsApp/Copiar. Com a API fora
// (offline), monta o molde determinístico local; sentAt entra pela fila.
import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Copy, Send } from 'lucide-react-native'
import type { MessageTemplate } from '@addere/types'
import { useClientes } from '../../../../src/hooks/useClientes'
import { useMessage, useMessageSent, usePlan } from '../../../../src/hooks/useIntel'
import { openWhatsApp } from '../../../../src/services/navigationLinks'
import { pilotTracker } from '../../../../src/services/pilotTracking'
import { localMessageFallback } from '../../../../src/utils/intelText'
import { SyncPill } from '../../../../src/components/intel/SyncPill'
import { colors, spacing, radius, typography } from '../../../../src/theme'

const TEMPLATES: { key: MessageTemplate; label: string; hint: string }[] = [
  { key: 'STALLED_PROPOSAL', label: 'Proposta parada', hint: 'orçamento enviado sem resposta' },
  { key: 'WENT_QUIET', label: 'Sumiu do ciclo', hint: 'passou do intervalo usual de compra' },
  { key: 'REACTIVATE', label: 'Reativação', hint: 'cliente inativo há meses' },
]

export default function MensagemScreen() {
  const { customerKey } = useLocalSearchParams<{ customerKey: string }>()
  const [customerCode = '', loja = '01'] = (customerKey ?? '').split('_')
  const { data: plan } = usePlan()
  const { data: customers } = useClientes()
  const message = useMessage()
  const messageSent = useMessageSent()

  const planItem = useMemo(
    () => plan?.items.find((i) => i.customerCode === customerCode && i.loja === loja) ?? null,
    [plan, customerCode, loja]
  )
  const customer = useMemo(
    () =>
      customers?.find((c) => c.protheusCode === customerCode && (c.loja ?? '01') === loja) ?? null,
    [customers, customerCode, loja]
  )
  const customerName = planItem?.customerName ?? customer?.name ?? 'cliente'
  const phone = planItem?.customerPhone ?? customer?.phone ?? null

  const [template, setTemplate] = useState<MessageTemplate>('WENT_QUIET')
  const [text, setText] = useState('')
  const [messageId, setMessageId] = useState<string | null>(null)
  const [source, setSource] = useState<'agent' | 'local' | null>(null)

  const generate = useCallback(
    async (chosen: MessageTemplate) => {
      setTemplate(chosen)
      try {
        const result = await message.mutateAsync({ customerCode, loja, template: chosen })
        setText(result.text)
        setMessageId(result.id)
        setSource('agent')
      } catch {
        // Offline ou erro: molde determinístico local — o vendedor não fica na mão
        setText(localMessageFallback(chosen, customerName, planItem?.signals ?? null))
        setMessageId(null)
        setSource('local')
      }
    },
    [message, customerCode, loja, customerName, planItem]
  )

  const send = useCallback(async () => {
    if (!text.trim()) return
    if (!phone) {
      Alert.alert('Sem telefone', 'Este cliente não tem telefone cadastrado — use Copiar.')
      return
    }
    const opened = await openWhatsApp(phone, text.trim())
    if (opened) {
      if (messageId) messageSent.markSent(messageId)
      pilotTracker.track({
        type: 'MESSAGE_SENT',
        metadata: { template, source: source ?? 'local' },
      })
    }
  }, [text, phone, messageId, messageSent, template, source])

  const copy = useCallback(async () => {
    if (!text.trim()) return
    await Clipboard.setStringAsync(text.trim())
    Alert.alert('Copiado', 'Mensagem copiada para a área de transferência.')
  }, [text])

  return (
    <ScrollView testID="screen-mensagem" style={s.container} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.name}>{customerName}</Text>
        <SyncPill />
      </View>

      <Text style={s.sectionTitle}>Qual situação?</Text>
      <View style={{ gap: spacing.sm }}>
        {TEMPLATES.map((option) => (
          <TouchableOpacity
            key={option.key}
            testID={`molde-${option.key}`}
            style={[s.templateCard, template === option.key && s.templateActive]}
            onPress={() => generate(option.key)}
          >
            <Text style={[s.templateLabel, template === option.key && { color: colors.brand.primary }]}>
              {option.label}
            </Text>
            <Text style={s.templateHint}>{option.hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {message.isPending && <Text style={s.generating}>Escrevendo a mensagem…</Text>}

      {text !== '' && (
        <>
          <Text style={s.sectionTitle}>
            Mensagem {source === 'local' ? '(molde padrão — sem conexão)' : ''}
          </Text>
          <TextInput
            testID="input-mensagem"
            style={s.textInput}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={600}
          />
          <View style={s.actionsRow}>
            <TouchableOpacity testID="btn-whatsapp" style={s.whatsapp} onPress={send}>
              <Send size={15} color={colors.neutral.white} strokeWidth={1.5} />
              <Text style={s.whatsappText}>Enviar no WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="btn-copiar" style={s.copy} onPress={copy}>
              <Copy size={15} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.copyText}>Copiar</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  templateCard: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
  },
  templateActive: { borderColor: colors.brand.primary, backgroundColor: colors.brand.tint },
  templateLabel: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  templateHint: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
  generating: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    fontStyle: 'italic',
  },
  textInput: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    minHeight: 120,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  whatsapp: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.external.whatsapp,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  whatsappText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    paddingHorizontal: spacing.lg,
  },
  copyText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
})
