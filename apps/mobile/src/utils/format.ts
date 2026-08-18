export function fmtMoeda(value: string | number): string {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Quantidades: inteiros sem casas decimais, fracionários com até 3 casas
export function fmtQtd(value: string | number): string {
  const n = Number(value)
  return n % 1 === 0
    ? n.toLocaleString('pt-BR')
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
}

// Data (dd/mm/aaaa) a partir de ISO string
export function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Data + hora curtas (ex.: 01/02/2026 14:30) a partir de ISO string
export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDocument(doc: string | null | undefined): string | null {
  if (!doc) return null
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (digits.length === 14)
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}
