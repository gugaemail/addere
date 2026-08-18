import { StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'
import { radius } from '../../theme/radius'

// Estilos compartilhados entre o wizard de novo pedido e a tela de edição.
// Antes cada tela redefinia estas ~40 chaves com valores quase idênticos.
export const orderFormStyles = StyleSheet.create({
  // ── Caixa de campo (box/summaryBox) ─────────────────────────
  fieldBox: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: 14,
    marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: colors.neutral.textSub,
    marginBottom: 10,
  },

  // ── Editor de item do carrinho ──────────────────────────────
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral.bg,
    paddingTop: 10,
    marginTop: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: colors.brand.dark,
    marginRight: 8,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.semantic.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: {
    fontFamily: 'Inter_400Regular',
    color: colors.semantic.danger,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  itemControls:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemQty:       { alignItems: 'center' },
  itemPrice:     { flex: 1, alignItems: 'flex-start' },
  itemSubtotal:  { alignItems: 'flex-end' },
  controlLabel:  { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.neutral.textSub, marginBottom: 4 },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.sm,
    padding: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    minWidth: 80,
    backgroundColor: colors.neutral.bg,
    color: colors.brand.dark,
  },
  subtotalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.brand.dark },
  itemExtraRow:   { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  itemExtraField: { flex: 1, minWidth: 80 },
  itemExtraFull:  { marginTop: 8 },
  xcravBtn: {
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.neutral.bg,
  },
  xcravBtnActive:     { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  xcravBtnText:       { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.neutral.text },
  xcravBtnTextActive: { color: colors.neutral.white },

  // ── PickerField ─────────────────────────────────────────────
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.neutral.bg,
  },
  pickerBtnDisabled:    { opacity: 0.6 },
  pickerBtnText:        { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.brand.dark },
  pickerBtnPlaceholder: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.textSub },
  pickerBtnIcon:        { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub },
  pickerList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: 8,
    backgroundColor: colors.neutral.white,
    overflow: 'hidden',
  },
  pickerItem:         { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral.bg },
  pickerItemText:     { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.text },
  pickerItemSelected: { fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.brand.primary },

  // ── Observações ─────────────────────────────────────────────
  notesInput: {
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: 8,
    padding: 10,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 80,
    backgroundColor: colors.neutral.bg,
    color: colors.brand.dark,
  },
})
