import { forwardRef, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { keyboardOverlap } from '../../utils/keyboard'

// Desde o Expo SDK 54 o Android é edge-to-edge: a janela não encolhe mais quando
// o teclado abre (o adjustResize deixou de valer) e o campo focado ficava atrás
// do teclado. No iOS a janela nunca encolheu. Os dois componentes abaixo fazem
// essa conta só em JS, então a correção vai por OTA.

/** Quanto da view o teclado cobre agora, em pontos; 0 com o teclado fechado. */
function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0)

  useEffect(() => {
    // No iOS o "will" chega antes da animação, e o change frame cobre a troca de
    // teclado (texto → numérico). O Android só avisa quando abre e quando fecha.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    let keyboardTop: number | null = null

    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardTop = e.endCoordinates.screenY
      // `measure` e não `measureInWindow`: no Android o measureInWindow desconta
      // a barra de status e o topo do teclado não, e a conta errava por 24 a 50 pt.
      ref.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
        setOverlap(keyboardOverlap(pageY + height, keyboardTop))
      })
    })
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardTop = null
      setOverlap(0)
    })

    return () => {
      show.remove()
      hide.remove()
    }
  }, [ref])

  return overlap
}

/**
 * View que reserva embaixo a parte coberta pelo teclado — o adjustResize de
 * antes. Serve para telas sem rolagem própria e para as folhas de baixo dos
 * modais. O `style` ocupa o lugar da view; o padding de baixo é dela.
 */
export function KeyboardInsetView({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const ref = useRef<View>(null)
  const overlap = useKeyboardOverlap(ref)

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.fill, style, overlap > 0 && { paddingBottom: overlap }]}
    >
      {children}
    </View>
  )
}

/**
 * ScrollView de formulário que mantém o campo focado acima do teclado.
 * - iOS: o próprio ScrollView desconta o teclado e rola até o campo
 *   (`automaticallyAdjustKeyboardInsets`).
 * - Android: o ScrollView encolhe até o topo do teclado e o Android rola sozinho
 *   até o campo focado, ao abrir o teclado e a cada troca de campo.
 * Toque em botão com o teclado aberto já vale (`keyboardShouldPersistTaps`).
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardAwareScrollView({ style, ...props }, ref) {
    if (Platform.OS === 'ios') {
      return (
        <ScrollView
          ref={ref}
          style={style}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          {...props}
        />
      )
    }

    return (
      <KeyboardInsetView style={style}>
        <ScrollView ref={ref} style={styles.fill} keyboardShouldPersistTaps="handled" {...props} />
      </KeyboardInsetView>
    )
  }
)

const styles = StyleSheet.create({
  fill: { flex: 1 },
})
