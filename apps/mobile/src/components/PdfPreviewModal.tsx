import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { FileText, Mail, Download, MessageCircle, X } from 'lucide-react-native'
import { generateOrderPdf } from '../services/pdfService'
import { shareViaWhatsApp, shareViaEmail, saveToCameraRoll } from '../services/shareService'
import type { Order } from '@addere/types'

interface Props {
  visible: boolean
  order: Order | null
  onClose: () => void
}

interface ActionBtnProps {
  icon: React.ReactNode
  label: string
  color: string
  onPress: () => void
  disabled: boolean
}

function ActionBtn({ icon, label, color, onPress, disabled }: ActionBtnProps) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, { backgroundColor: color }, disabled && s.disabled]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
    >
      {icon}
      <Text style={s.actionLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

export function PdfPreviewModal({ visible, order, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [pdfUri, setPdfUri] = useState<string | null>(null)

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
      await shareViaEmail(uri, order)
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
              <FileText size={18} color="#1B4FA8" strokeWidth={1.5} />
              <Text style={s.title}>Exportar Pedido {orderLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color="#64748B" strokeWidth={1.5} />
            </TouchableOpacity>
          </View>

          <Text style={s.subtitle}>{order.customer.name}</Text>

          {loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color="#1B4FA8" />
              <Text style={s.loadingText}>Gerando PDF...</Text>
            </View>
          ) : (
            <View style={s.actions}>
              <ActionBtn
                icon={<MessageCircle size={22} color="#fff" strokeWidth={1.5} />}
                label="WhatsApp"
                color="#25D366"
                onPress={handleWhatsApp}
                disabled={loading}
              />
              <ActionBtn
                icon={<Mail size={22} color="#fff" strokeWidth={1.5} />}
                label="E-mail"
                color="#1B4FA8"
                onPress={handleEmail}
                disabled={loading}
              />
              <ActionBtn
                icon={<Download size={22} color="#fff" strokeWidth={1.5} />}
                label="Salvar no celular"
                color="#64748B"
                onPress={handleSave}
                disabled={loading}
              />
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
    backgroundColor: 'rgba(13, 32, 69, 0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
    shadowColor: '#0D2045',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: '#0D2045',
    flex: 1,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#64748B',
    marginBottom: 20,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#64748B',
  },
  actions: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  actionLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  disabled: {
    opacity: 0.5,
  },
})
