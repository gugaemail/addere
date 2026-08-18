import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { FileText, Mail, Download, MessageCircle, X } from 'lucide-react-native'
import { generateOrderPdf } from '../services/pdfService'
import { shareViaWhatsApp, shareViaEmail, saveToCameraRoll } from '../services/shareService'
import { useAuthStore } from '../store/auth.store'
import { Button, buttonForeground } from './ui/Button'
import { LoadingState } from './Skeleton'
import { colors, spacing, radius, typography } from '../theme'
import type { Order } from '@addere/types'

interface Props {
  visible: boolean
  order: Order | null
  onClose: () => void
}

export function PdfPreviewModal({ visible, order, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [pdfUri, setPdfUri] = useState<string | null>(null)
  const userName = useAuthStore((s) => s.user?.name)

  // Limpa o PDF em cache ao abrir um novo pedido
  useEffect(() => {
    if (!visible) return
    setPdfUri(null)
    setLoading(false)
  }, [visible, order?.id])

  async function getPdf(): Promise<string | null> {
    if (pdfUri) return pdfUri
    if (!order) return null
    setLoading(true)
    try {
      const uri = await generateOrderPdf(order)
      setPdfUri(uri)
      return uri
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar o PDF do pedido.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function handleWhatsApp() {
    const uri = await getPdf()
    if (!uri || !order) return
    try {
      await shareViaWhatsApp(uri, order)
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o compartilhamento.')
    }
  }

  async function handleEmail() {
    const uri = await getPdf()
    if (!uri || !order) return
    try {
      await shareViaEmail(uri, order, userName)
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o compositor de email.')
    }
  }

  async function handleSave() {
    const uri = await getPdf()
    if (!uri) return
    try {
      await saveToCameraRoll(uri)
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o PDF.')
    }
  }

  if (!order) return null

  const orderLabel = order.protheusOrderId ?? `#${order.id.slice(-6).toUpperCase()}`

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={s.sheet}>
          {/* Alça visual do bottom sheet */}
          <View style={s.handle} />

          {/* Cabeçalho */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <FileText size={18} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.title}>Exportar Pedido {orderLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
            >
              <X size={20} color={colors.neutral.textSub} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>{order.customer.name}</Text>

          {loading ? (
            <View style={s.loadingBox}>
              <LoadingState style={s.loadingSpinner} />
              <Text style={s.loadingText}>Gerando PDF...</Text>
            </View>
          ) : (
            <View style={s.actions}>
              <Button
                variant="primary"
                size="lg"
                style={s.whatsappBtn}
                icon={<MessageCircle size={20} color={buttonForeground.primary} strokeWidth={1.5} />}
                onPress={handleWhatsApp}
                disabled={loading}
              >
                WhatsApp
              </Button>
              <Button
                variant="primary"
                size="lg"
                icon={<Mail size={20} color={buttonForeground.primary} strokeWidth={1.5} />}
                onPress={handleEmail}
                disabled={loading}
              >
                E-mail
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon={<Download size={20} color={buttonForeground.secondary} strokeWidth={1.5} />}
                onPress={handleSave}
                disabled={loading}
              >
                Salvar no celular
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay.scrim,
  },
  sheet: {
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    shadowColor: colors.brand.dark,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral.border,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
    flex: 1,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginBottom: spacing.lg,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  loadingSpinner: {
    flex: 0,
    paddingVertical: 0,
  },
  loadingText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  actions: {
    gap: spacing.sm,
  },
  whatsappBtn: {
    backgroundColor: colors.external.whatsapp,
  },
})
