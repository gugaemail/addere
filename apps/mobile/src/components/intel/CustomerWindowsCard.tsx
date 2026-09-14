// Horário de atendimento do cliente (E16) — as janelas que o motor usa para
// prever a hora de cada visita. As de cadastro/gerente são só leitura; as do
// vendedor podem ser adicionadas e removidas. PUT substitui a lista inteira
// das janelas do vendedor, então cada mudança envia a lista completa — e é
// online: sem rede, avisa e não enfileira.
import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Clock, Plus, Trash2 } from 'lucide-react-native'
import type { CustomerWindowDto } from '@addere/types'
import { isNetworkError, useCustomerWindows, useSaveCustomerWindows } from '../../hooks/useIntel'
import { useHasVendorCode } from '../../hooks/useProfile'
import {
  maskTime,
  SELECTABLE_WEEKDAYS,
  sortWindows,
  validateWindow,
  windowLabel,
  type WindowInput,
} from '../../utils/customerWindows'
import { WEEKDAY_SHORT } from '../../utils/calendar'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { colors, spacing, radius, typography } from '../../theme'

interface CustomerWindowsCardProps {
  customerCode: string
  loja: string
}

const toInput = (w: CustomerWindowDto): WindowInput => ({
  weekday: w.weekday,
  startTime: w.startTime,
  endTime: w.endTime,
})

const sameWindow = (a: WindowInput, b: WindowInput): boolean =>
  a.weekday === b.weekday && a.startTime === b.startTime && a.endTime === b.endTime

const SOURCE_LABEL: Record<CustomerWindowDto['source'], string | null> = {
  SELLER: null,
  CADASTRO: 'cadastro',
  MANAGER: 'gerente',
}

export function CustomerWindowsCard({ customerCode, loja }: CustomerWindowsCardProps) {
  // Só quem tem carteira consulta/edita janelas (rota /intel/app/*)
  const hasVendorCode = useHasVendorCode()
  const windows = useCustomerWindows(customerCode, loja, hasVendorCode)
  const save = useSaveCustomerWindows()
  const [open, setOpen] = useState(false)
  const [weekday, setWeekday] = useState<number>(1)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = sortWindows(windows.data ?? [])
  const sellerWindows = (windows.data ?? []).filter((w) => w.source === 'SELLER').map(toInput)

  const persist = useCallback(
    async (next: WindowInput[]): Promise<boolean> => {
      try {
        await save.mutateAsync({ customerCode, loja, windows: sortWindows(next) })
        return true
      } catch (err) {
        Alert.alert(
          'Não foi possível salvar',
          isNetworkError(err) ? 'Sem conexão — tente de novo online.' : 'Tente de novo em instantes.'
        )
        return false
      }
    },
    [customerCode, loja, save]
  )

  const openSheet = useCallback(() => {
    setError(null)
    setStartTime('')
    setEndTime('')
    setOpen(true)
  }, [])

  const add = useCallback(async () => {
    const candidate = { weekday, startTime: startTime.trim(), endTime: endTime.trim() }
    const check = validateWindow(candidate)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setError(null)
    const next = sellerWindows.some((w) => sameWindow(w, candidate))
      ? sellerWindows
      : [...sellerWindows, candidate]
    if (await persist(next)) setOpen(false)
  }, [weekday, startTime, endTime, sellerWindows, persist])

  const remove = useCallback(
    (target: CustomerWindowDto) => {
      Alert.alert('Remover horário', `Remover ${windowLabel(target)}?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            persist(sellerWindows.filter((w) => !sameWindow(w, toInput(target))))
          },
        },
      ])
    },
    [sellerWindows, persist]
  )

  if (!hasVendorCode) return null

  return (
    <Card style={s.card} testID="card-janelas">
      <View style={s.header}>
        <Clock size={15} color={colors.brand.primary} strokeWidth={1.5} />
        <Text style={s.title}>Horário de atendimento</Text>
        <TouchableOpacity
          testID="btn-adicionar-janela"
          style={s.addButton}
          onPress={openSheet}
          hitSlop={4}
        >
          <Plus size={14} color={colors.brand.primary} strokeWidth={1.5} />
          <Text style={s.addText}>Adicionar</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>O motor usa isso para prever a hora de cada visita.</Text>

      {windows.isLoading ? (
        <ActivityIndicator size="small" color={colors.brand.primary} style={s.loading} />
      ) : list.length === 0 ? (
        <Text style={s.empty}>Nenhum horário informado.</Text>
      ) : (
        list.map((w, index) => {
          const source = SOURCE_LABEL[w.source]
          return (
            <View key={`${w.weekday}-${w.startTime}-${w.endTime}-${w.source}`} style={s.row}>
              <Text style={s.rowText}>{windowLabel(w)}</Text>
              {source ? <Text style={s.rowSource}>{source}</Text> : null}
              {w.source === 'SELLER' && (
                <TouchableOpacity
                  testID={`btn-remover-janela-${index + 1}`}
                  onPress={() => remove(w)}
                  hitSlop={8}
                  disabled={save.isPending}
                  accessibilityLabel="Remover horário"
                >
                  <Trash2 size={15} color={colors.neutral.textSub} strokeWidth={1.5} />
                </TouchableOpacity>
              )}
            </View>
          )
        })
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Novo horário</Text>
            <View style={s.dayRow}>
              {SELECTABLE_WEEKDAYS.map((day) => (
                <TouchableOpacity
                  key={day}
                  testID={`janela-dia-${day}`}
                  style={[s.dayChip, weekday === day && s.dayChipActive]}
                  onPress={() => setWeekday(day)}
                  accessibilityState={{ selected: weekday === day }}
                >
                  <Text style={[s.dayChipText, weekday === day && s.dayChipTextActive]}>
                    {WEEKDAY_SHORT[day]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.timeRow}>
              <View style={{ flex: 1 }}>
                <Input
                  testID="input-janela-inicio"
                  label="Início"
                  placeholder="08:00"
                  value={startTime}
                  onChangeText={(v) => setStartTime(maskTime(v))}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  testID="input-janela-fim"
                  label="Fim"
                  placeholder="12:00"
                  value={endTime}
                  onChangeText={(v) => setEndTime(maskTime(v))}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <View style={s.sheetActions}>
              <Button variant="ghost" size="md" onPress={() => setOpen(false)} disabled={save.isPending}>
                Cancelar
              </Button>
              <Button
                testID="btn-salvar-janela"
                variant="primary"
                size="md"
                onPress={add}
                loading={save.isPending}
                style={{ flex: 1 }}
              >
                Salvar
              </Button>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </Card>
  )
}

const s = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    flex: 1,
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.brand.tint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.brand.primary,
  },
  hint: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  loading: { alignSelf: 'flex-start', marginVertical: spacing.xs },
  empty: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.placeholder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.subtle,
  },
  rowText: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  rowSource: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.placeholder,
  },
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
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral.border,
    borderRadius: radius.full,
    alignSelf: 'center',
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.neutral.white,
  },
  dayChipActive: { backgroundColor: colors.brand.tint, borderColor: colors.brand.primary },
  dayChipText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  dayChipTextActive: { color: colors.brand.primary },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  error: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.semantic.danger,
  },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
