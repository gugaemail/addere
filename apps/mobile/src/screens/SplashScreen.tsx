import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { LogoMark } from '../components/brand/LogoMark'

export function SplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity }]}>
        <LogoMark size={80} variant="dark" />
        <Animated.Text style={styles.logoText}>addere</Animated.Text>
        <Animated.Text style={styles.subtitle}>ERP Mobile</Animated.Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D2045',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoText: {
    marginTop: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: 32 * -0.03,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#29BEFF',
  },
})
