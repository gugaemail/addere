import { useEffect, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '../theme/colors'

const STORAGE_PREFIX = 'coachmark_seen_'

interface Props {
  id: string
  message: string
  visible: boolean
  position?: 'top' | 'bottom'
  onDismiss: () => void
}

export function CoachMark({ id, message, visible, position = 'bottom', onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(async () => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start()
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${id}`, 'true')
    onDismiss()
  }, [id, onDismiss, opacity])

  useEffect(() => {
    if (!visible) return

    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()

    timerRef.current = setTimeout(dismiss, 5000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [visible, dismiss, opacity])

  if (!visible) return null

  return (
    <TouchableOpacity activeOpacity={1} onPress={dismiss} style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.container, position === 'top' ? styles.top : styles.bottom, { opacity }]}>
        <View style={styles.bubble}>
          <Text style={styles.text}>{message}</Text>
          <View style={position === 'top' ? styles.arrowDown : styles.arrowUp} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  )
}

export async function hasSeenCoachMark(id: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`)
  return val === 'true'
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  top: {
    top: 80,
  },
  bottom: {
    bottom: 100,
  },
  bubble: {
    backgroundColor: colors.brand.dark,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  text: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
  },
  arrowUp: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.brand.dark,
  },
  arrowDown: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.brand.dark,
  },
})
