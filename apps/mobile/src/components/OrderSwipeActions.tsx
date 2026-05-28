import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { FileText } from 'lucide-react-native'
import type { Order } from '@addere/types'

interface Props {
  order: Order
  onPdf: (order: Order) => void
  children: React.ReactNode
}

function PdfActionButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={s.action} onPress={onPress} activeOpacity={0.75}>
      <FileText size={20} color="#fff" strokeWidth={1.5} />
      <Text style={s.actionText}>PDF</Text>
    </TouchableOpacity>
  )
}

export function OrderSwipeActions({ order, onPdf, children }: Props) {
  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <View style={s.rightContainer}>
          <PdfActionButton onPress={() => onPdf(order)} />
        </View>
      )}
      rightThreshold={40}
      friction={2}
      overshootRight={false}
    >
      {children}
    </ReanimatedSwipeable>
  )
}

const s = StyleSheet.create({
  rightContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  action: {
    backgroundColor: '#1B4FA8',
    justifyContent: 'center',
    alignItems: 'center',
    width: 68,
    height: '100%',
    borderRadius: 12,
    gap: 5,
  },
  actionText: {
    color: '#fff',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
})
