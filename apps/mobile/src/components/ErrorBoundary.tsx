import React from 'react'
import * as Sentry from '@sentry/react-native'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from './ui/Button'
import { colors, spacing, typography } from '../theme'

function FallbackUI({ resetError }: { resetError: () => void }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Algo deu errado</Text>
        <Text style={styles.message}>
          Ocorreu um erro inesperado. Nossa equipe foi notificada automaticamente.
        </Text>
        <Button variant="primary" size="lg" style={styles.button} onPress={resetError}>
          Reiniciar app
        </Button>
      </View>
    </SafeAreaView>
  )
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <FallbackUI resetError={resetError} />}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 22,
    color: colors.brand.dark,
    textAlign: 'center',
  },
  message: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.neutral.textSub,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.sm,
  },
})
