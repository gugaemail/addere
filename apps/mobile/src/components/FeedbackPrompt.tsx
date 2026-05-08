import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native'
import { ThumbsUp, ThumbsDown, X } from 'lucide-react-native'
import { useSyncStore } from '../store/syncStore'
import { api } from '../lib/api'
import { colors } from '../theme/colors'

const SESSION_SHOWN_KEY = '__feedback_shown_this_session__'
let shownThisSession = false

export function FeedbackPrompt() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<'rating' | 'comment' | 'done'>('rating')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const slideAnim = useRef(new Animated.Value(300)).current

  const justSyncedOrderAt = useSyncStore((s) => s.justSyncedOrderAt)
  const clearJustSyncedOrder = useSyncStore((s) => s.clearJustSyncedOrder)

  useEffect(() => {
    if (!justSyncedOrderAt || shownThisSession) return

    const timer = setTimeout(() => {
      shownThisSession = true
      clearJustSyncedOrder()
      setVisible(true)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start()
    }, 2000)

    return () => clearTimeout(timer)
  }, [justSyncedOrderAt, clearJustSyncedOrder, slideAnim])

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false)
      setStep('rating')
      setComment('')
    })
  }, [slideAnim])

  const handlePositive = useCallback(async () => {
    try {
      await api.post('/pilot/feedback', { rating: 'positive' })
    } catch {
      // silencioso
    }
    setStep('done')
    setTimeout(dismiss, 1500)
  }, [dismiss])

  const handleNegative = useCallback(() => {
    setStep('comment')
  }, [])

  const handleSubmitComment = useCallback(async () => {
    setSubmitting(true)
    try {
      await api.post('/pilot/feedback', { rating: 'negative', comment: comment.trim() || undefined })
    } catch {
      // silencioso
    } finally {
      setSubmitting(false)
    }
    dismiss()
  }, [comment, dismiss])

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Alça */}
          <View style={styles.handle} />

          {/* Fechar */}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <X size={18} color="#94A3B8" />
          </TouchableOpacity>

          {step === 'rating' && (
            <>
              <Text style={styles.title}>Pedido enviado!</Text>
              <Text style={styles.subtitle}>Como foi a experiência?</Text>
              <View style={styles.ratingRow}>
                <TouchableOpacity style={[styles.ratingBtn, styles.positiveBtn]} onPress={handlePositive}>
                  <ThumbsUp size={28} color="#22C55E" />
                  <Text style={[styles.ratingLabel, { color: '#22C55E' }]}>Ótimo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.ratingBtn, styles.negativeBtn]} onPress={handleNegative}>
                  <ThumbsDown size={28} color="#EF4444" />
                  <Text style={[styles.ratingLabel, { color: '#EF4444' }]}>Tive um problema</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'comment' && (
            <>
              <Text style={styles.title}>O que aconteceu?</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Descreva o problema brevemente..."
                placeholderTextColor="#94A3B8"
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.sendBtn, submitting && styles.sendBtnDisabled]}
                onPress={handleSubmitComment}
                disabled={submitting}
              >
                <Text style={styles.sendBtnText}>{submitting ? 'Enviando...' : 'Enviar'}</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'done' && (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}>
                <ThumbsUp size={32} color="#22C55E" />
              </View>
              <Text style={styles.doneText}>Obrigado pelo feedback!</Text>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    minHeight: 200,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    padding: 4,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: colors.brand.dark,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ratingBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 10,
    borderWidth: 2,
    gap: 8,
  },
  positiveBtn: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  negativeBtn: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  ratingLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.brand.dark,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  sendBtn: {
    backgroundColor: colors.brand.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  doneContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    color: colors.brand.dark,
  },
})
