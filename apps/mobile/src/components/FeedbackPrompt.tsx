import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native'
import { ThumbsUp, ThumbsDown, X } from 'lucide-react-native'
import { useSyncStore } from '../store/syncStore'
import { api } from '../lib/api'
import { colors, spacing, radius, typography } from '../theme'
import { Button } from './ui/Button'
import { Input } from './ui/Input'

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
      await api.post('/pilot/feedback', {
        rating: 'negative',
        comment: comment.trim() || undefined,
      })
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

          {/* Fechar — ícone puro com hitSlop */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={dismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <X size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />
          </TouchableOpacity>

          {step === 'rating' && (
            <>
              <Text style={styles.title}>Pedido enviado!</Text>
              <Text style={styles.subtitle}>Como foi a experiência?</Text>
              <View style={styles.ratingRow}>
                {/* Chips de avaliação (positivo/negativo) — mantidos como chips com tokens */}
                <TouchableOpacity
                  style={[styles.ratingBtn, styles.positiveBtn]}
                  onPress={handlePositive}
                  activeOpacity={0.75}
                >
                  <ThumbsUp size={28} color={colors.semantic.success} strokeWidth={1.5} />
                  <Text style={[styles.ratingLabel, { color: colors.semantic.success }]}>
                    Ótimo
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ratingBtn, styles.negativeBtn]}
                  onPress={handleNegative}
                  activeOpacity={0.75}
                >
                  <ThumbsDown size={28} color={colors.semantic.danger} strokeWidth={1.5} />
                  <Text style={[styles.ratingLabel, { color: colors.semantic.danger }]}>
                    Tive um problema
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'comment' && (
            <>
              <Text style={styles.title}>O que aconteceu?</Text>
              <Input
                placeholder="Descreva o problema brevemente..."
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                autoFocus
                textAlignVertical="top"
                containerStyle={styles.textInputContainer}
                style={styles.textInput}
              />
              <Button
                variant="primary"
                size="lg"
                loading={submitting}
                onPress={handleSubmitComment}
                style={styles.sendBtn}
              >
                Enviar
              </Button>
            </>
          )}

          {step === 'done' && (
            <View style={styles.doneContainer}>
              <View style={styles.doneIcon}>
                <ThumbsUp size={32} color={colors.semantic.success} strokeWidth={1.5} />
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
    backgroundColor: colors.overlay.scrim,
  },
  sheet: {
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    minHeight: 200,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral.border,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.xl,
    color: colors.brand.dark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.neutral.textSub,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ratingBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.sm,
  },
  positiveBtn: {
    borderColor: colors.semantic.success,
    backgroundColor: colors.semantic.successLight,
  },
  negativeBtn: {
    borderColor: colors.semantic.danger,
    backgroundColor: colors.semantic.dangerLight,
  },
  ratingLabel: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
  },
  textInputContainer: {
    alignItems: 'flex-start',
  },
  textInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sendBtn: {
    marginTop: spacing.md,
  },
  doneContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
  },
})
