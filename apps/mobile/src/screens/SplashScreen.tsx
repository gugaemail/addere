import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { LogoMark } from '../components/brand/LogoMark'
import { colors, spacing, typography } from '../theme'

export function SplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start()
  }, [opacity])

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity }]}>
        <LogoMark size={80} variant="dark" />
        <Animated.Text style={styles.logoText}>Addere</Animated.Text>
        <Animated.Text style={styles.subtitle}>ERP Mobile</Animated.Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    // Largura cheia + textAlign nos filhos: no Android a caixa medida para a
    // fonte custom sai estreita demais e corta o ultimo glifo ("Adder|e").
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoText: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginTop: spacing.md,
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 32,
    color: colors.neutral.white,
    letterSpacing: 32 * -0.03,
  },
  subtitle: {
    alignSelf: 'stretch',
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.body,
    fontSize: 14,
    color: colors.brand.accent,
  },
})
