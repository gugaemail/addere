import { StyleSheet } from 'react-native'
import { colors } from '../../theme/colors'
import { radius } from '../../theme/radius'
import { spacing } from '../../theme/spacing'
import { typography } from '../../theme/typography'

const { fontFamily } = typography

// Estilos compartilhados entre o wizard de novo pedido e a tela de edição.
// Antes cada tela redefinia estas ~40 chaves com valores quase idênticos.
export const orderFormStyles = StyleSheet.create({
  // ── Caixa de campo (box/summaryBox) ─────────────────────────
  fieldBox: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 12,
    color: colors.neutral.textSub,
    marginBottom: spacing.sm,
  },
  // Mensagem de erro inline (mesmo visual do Input)
  fieldError: {
    fontFamily: fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.semantic.danger,
    marginTop: spacing.xs,
  },
  // Aviso geral do formulário (ex.: carrinho vazio / campos pendentes)
  formError: {
    fontFamily: fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.semantic.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // ── Editor de item do carrinho ──────────────────────────────
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: colors.neutral.bg,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  itemName: {
    flex: 1,
    fontFamily: fontFamily.sansSemibold,
    fontSize: 13,
    color: colors.brand.dark,
    marginRight: spacing.sm,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.semantic.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemControls:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemQty:       { minWidth: 80 },
  itemPrice:     { flex: 1 },
  itemSubtotal:  { alignItems: 'flex-end' },
  controlLabel:  { fontFamily: fontFamily.body, fontSize: typography.size.xs, color: colors.neutral.textSub, marginBottom: spacing.xs },
  // Campo compacto do editor de item (aplicado via containerStyle/style do Input)
  compactField: {
    backgroundColor: colors.neutral.bg,
    paddingHorizontal: spacing.sm,
    minWidth: 80,
  },
  compactInput: {
    fontSize: 13,
    paddingVertical: spacing.xs,
    color: colors.brand.dark,
  },
  subtotalValue: { fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.brand.dark, paddingVertical: spacing.xs },
  itemExtraRow:   { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  itemExtraField: { flex: 1, minWidth: 80 },
  itemExtraFull:  { marginTop: spacing.sm },
  xcravBtn:       { alignSelf: 'flex-start' },

  // ── PickerField ─────────────────────────────────────────────
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.neutral.bg,
  },
  pickerBtnError:       { borderColor: colors.semantic.danger },
  pickerBtnDisabled:    { opacity: 0.6 },
  pickerBtnText:        { fontFamily: fontFamily.body, fontSize: 14, color: colors.brand.dark },
  pickerBtnPlaceholder: { fontFamily: fontFamily.body, fontSize: 14, color: colors.neutral.textSub },
  pickerList: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral.white,
    overflow: 'hidden',
  },
  pickerItem:         { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.neutral.bg },
  pickerItemText:     { fontFamily: fontFamily.body, fontSize: 14, color: colors.neutral.text },
  pickerItemSelected: { fontFamily: fontFamily.sansSemibold, color: colors.brand.primary },

  // ── Observações (Input multiline) ───────────────────────────
  notesField: {
    backgroundColor: colors.neutral.bg,
    alignItems: 'flex-start',
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.brand.dark,
  },
})
