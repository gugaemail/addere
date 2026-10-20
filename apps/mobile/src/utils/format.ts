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

// Telefone gravado (Protheus/cadastro) para exibição, como no painel
// (apps/web/src/lib/utils.ts): 10 dígitos = fixo (11) 3456-7890; 11 = celular
// (11) 98765-4321; 0800/0300 em blocos; DDI 55 e zero de operadora saem.
// Formato desconhecido fica como veio.
const SERVICE_NUMBER = /^0[3589]00/

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (SERVICE_NUMBER.test(d)) {
    return d.length >= 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone
  }
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.replace(/^0+/, '')
  if (d.length !== 10 && d.length !== 11) return phone
  const split = d.length === 11 ? 7 : 6
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`
}
