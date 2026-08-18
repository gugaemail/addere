import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, Modal, Dimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle, Rect, Path, Line } from 'react-native-svg'
import { colors, spacing, radius, typography } from '../../theme'
import { Button } from '../ui/Button'

const STORAGE_KEY = 'hasCompletedOnboarding'
const { width } = Dimensions.get('window')

// ─── Ilustrações SVG ─────────────────────────────────────────────────────────

function RepIllustration() {
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160">
      {/* Corpo */}
      <Circle cx="80" cy="60" r="28" fill={colors.brand.primary} />
      <Rect x="52" y="88" width="56" height="52" rx="12" fill={colors.brand.primary} />
      {/* Rosto */}
      <Circle cx="80" cy="60" r="20" fill={colors.brand.tint} />
      <Circle cx="74" cy="57" r="3" fill={colors.brand.dark} />
      <Circle cx="86" cy="57" r="3" fill={colors.brand.dark} />
      <Path
        d="M74 67 Q80 73 86 67"
        stroke={colors.brand.dark}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Tablet */}
      <Rect
        x="88"
        y="96"
        width="28"
        height="36"
        rx="4"
        fill={colors.neutral.white}
        stroke={colors.brand.accent}
        strokeWidth="2"
      />
      <Rect x="92" y="102" width="20" height="12" rx="2" fill={colors.brand.tint} />
      <Line x1="92" y1="120" x2="112" y2="120" stroke={colors.brand.accent} strokeWidth="1.5" />
      <Line x1="92" y1="125" x2="108" y2="125" stroke={colors.brand.accent} strokeWidth="1.5" />
    </Svg>
  )
}

function OrderFlowIllustration({ step }: { step: number }) {
  const stepColor = (s: number) => (step >= s ? colors.brand.primary : colors.neutral.disabled)
  return (
    <Svg width={260} height={100} viewBox="0 0 260 100">
      {[0, 1, 2].map((i) => (
        <View key={i}>
          <Circle cx={50 + i * 80} cy={50} r={24} fill={stepColor(i + 1)} />
        </View>
      ))}
      <Path d="M74 50 L106 50" stroke={stepColor(2)} strokeWidth={2} strokeDasharray="4 2" />
      <Path d="M154 50 L186 50" stroke={stepColor(3)} strokeWidth={2} strokeDasharray="4 2" />
      {/* ícone cliente */}
      <Circle cx="50" cy="50" r="24" fill={stepColor(1)} />
      <Circle cx="50" cy="44" r="8" fill={colors.neutral.white} opacity="0.9" />
      <Path
        d="M34 66 Q50 56 66 66"
        stroke={colors.neutral.white}
        strokeWidth="2"
        fill="none"
        opacity="0.9"
      />
      {/* ícone produto */}
      <Circle cx="130" cy="50" r="24" fill={stepColor(2)} />
      <Rect
        x="120"
        y="41"
        width="20"
        height="18"
        rx="3"
        fill={colors.neutral.white}
        opacity="0.9"
      />
      <Path d="M124 45 L136 45M124 50 L133 50" stroke={stepColor(2)} strokeWidth="1.5" />
      {/* ícone confirmar */}
      <Circle cx="210" cy="50" r="24" fill={stepColor(3)} />
      <Path
        d="M200 50 L207 57 L220 44"
        stroke={colors.neutral.white}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </Svg>
  )
}

function OfflineIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Círculo de fundo com cor positiva */}
      <Circle cx="60" cy="60" r="52" fill={colors.brand.tint} />
      {/* Ícone wifi com X */}
      <Path d="M60 82 L60 82" stroke={colors.brand.primary} strokeWidth="4" strokeLinecap="round" />
      <Path
        d="M47 70 Q60 64 73 70"
        stroke={colors.brand.primary}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <Path
        d="M36 60 Q60 48 84 60"
        stroke={colors.brand.primary}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />
      {/* Nuvem com seta para baixo (offline salvo) */}
      <Path
        d="M38 46 Q38 36 48 36 Q50 28 62 30 Q72 24 76 34 Q86 34 84 46 Z"
        fill={colors.brand.primary}
      />
      <Path
        d="M60 42 L60 54 M54 50 L60 56 L66 50"
        stroke={colors.neutral.white}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Check verde */}
      <Circle cx="82" cy="76" r="14" fill={colors.semantic.success} />
      <Path
        d="M76 76 L80 80 L88 70"
        stroke={colors.neutral.white}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ─── Telas ──────────────────────────────────────────────────────────────────

const screens = [
  {
    key: 'welcome',
    renderIllustration: () => <RepIllustration />,
    title: 'Bem-vindo ao Addere',
    subtitle: 'Seus pedidos chegam direto no Protheus, mesmo sem internet.',
    buttonLabel: 'Começar',
  },
  {
    key: 'order',
    renderIllustration: () => <OrderFlowIllustration step={3} />,
    title: 'Como fazer um pedido',
    subtitle: null,
    steps: ['Escolha o cliente', 'Adicione produtos', 'Confirme o pedido'],
    buttonLabel: 'Entendi',
  },
  {
    key: 'offline',
    renderIllustration: () => <OfflineIllustration />,
    title: 'Sem sinal? Sem problema.',
    subtitle:
      'O pedido fica salvo no celular e é enviado automaticamente quando a conexão voltar. Acompanhe pela barra de status no topo.',
    buttonLabel: 'Vamos lá',
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onComplete: () => void
}

export function OnboardingFlow({ visible, onComplete }: Props) {
  const [index, setIndex] = useState(0)

  const advance = useCallback(async () => {
    if (index < screens.length - 1) {
      setIndex(index + 1)
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, 'true')
      onComplete()
    }
  }, [index, onComplete])

  const screen = screens[index]

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        {/* Indicadores de progresso */}
        <View style={styles.dots}>
          {screens.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        {/* Ilustração */}
        <View style={styles.illustration}>{screen.renderIllustration()}</View>

        {/* Conteúdo */}
        <View style={styles.content}>
          <Text style={styles.title}>{screen.title}</Text>

          {screen.subtitle && <Text style={styles.subtitle}>{screen.subtitle}</Text>}

          {'steps' in screen && screen.steps && (
            <View style={styles.steps}>
              {screen.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Botão */}
        <Button variant="primary" size="lg" onPress={advance} style={styles.button}>
          {screen.buttonLabel}
        </Button>
      </View>
    </Modal>
  )
}

export async function shouldShowOnboarding(): Promise<boolean> {
  const val = await AsyncStorage.getItem(STORAGE_KEY)
  return val === null
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.xs,
    backgroundColor: colors.neutral.disabled,
  },
  dotActive: {
    backgroundColor: colors.brand.primary,
    width: spacing.lg,
  },
  illustration: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 26,
    color: colors.brand.dark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontFamily: typography.fontFamily.body,
    fontSize: 16,
    color: colors.neutral.textSub,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: width - 80,
  },
  steps: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 14,
    color: colors.neutral.white,
  },
  stepText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 16,
    color: colors.brand.dark,
  },
  button: {
    width: '100%',
  },
})
