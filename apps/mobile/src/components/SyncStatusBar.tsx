import React from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import { Wifi, WifiOff, Upload, AlertCircle, CheckCircle } from 'lucide-react-native'
import { useSyncQueue } from '../hooks/useSyncQueue'

interface SyncStatusBarProps {
  style?: ViewStyle
}

export function SyncStatusBar({ style }: SyncStatusBarProps) {
  const router = useRouter()
  const { networkAvailable, isSyncing, pendingCount, errorItems, hasPending } = useSyncQueue()

  if (!networkAvailable) {
    return (
      <TouchableOpacity
        style={[s.bar, s.offline, style]}
        onPress={() => router.push('/(app)/pedidos/pendentes')}
        activeOpacity={0.85}
      >
        <WifiOff size={14} color="#FFFFFF" strokeWidth={1.5} />
        <Text style={s.text}>Sem conexão — pedidos serão enviados ao reconectar</Text>
      </TouchableOpacity>
    )
  }

  if (isSyncing) {
    return (
      <View style={[s.bar, s.syncing, style]}>
        <ActivityIndicator size={14} color="#FFFFFF" />
        <Text style={s.text}>Sincronizando...</Text>
      </View>
    )
  }

  if (errorItems.length > 0) {
    return (
      <TouchableOpacity
        style={[s.bar, s.error, style]}
        onPress={() => router.push('/(app)/pedidos/pendentes')}
        activeOpacity={0.85}
      >
        <AlertCircle size={14} color="#FFFFFF" strokeWidth={1.5} />
        <Text style={s.text}>
          {errorItems.length} pedido{errorItems.length !== 1 ? 's' : ''} com erro
        </Text>
        <Text style={s.link}>Ver detalhes</Text>
      </TouchableOpacity>
    )
  }

  if (hasPending) {
    return (
      <TouchableOpacity
        style={[s.bar, s.pending, style]}
        onPress={() => router.push('/(app)/pedidos/pendentes')}
        activeOpacity={0.85}
      >
        <Upload size={14} color="#FFFFFF" strokeWidth={1.5} />
        <Text style={s.text}>
          {pendingCount} pedido{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''}
        </Text>
        <Text style={s.link}>Sincronizar agora</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.bar, s.synced, style]}>
      <CheckCircle size={14} color="#FFFFFF" strokeWidth={1.5} />
      <Text style={s.text}>Tudo sincronizado</Text>
    </View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   8,
    gap: 8,
  },
  synced:  { backgroundColor: '#22C55E' },
  pending: { backgroundColor: '#F59E0B' },
  syncing: { backgroundColor: '#1B4FA8' },
  offline: { backgroundColor: '#EF4444' },
  error:   { backgroundColor: '#EF4444' },
  text: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize:   12,
    color:      '#FFFFFF',
  },
  link: {
    fontFamily: 'Inter_400Regular',
    fontSize:   12,
    color:      '#FFFFFF',
    textDecorationLine: 'underline',
  },
})
