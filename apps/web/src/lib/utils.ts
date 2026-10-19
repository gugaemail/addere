import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value))
}

// Todos os clientes estão no Brasil: data com hora é exibida no horário de
// Brasília, não no fuso de quem abre o painel.
const BRAZIL_TIME_ZONE = 'America/Sao_Paulo'

// Dia civil sem hora: a chave 'YYYY-MM-DD' ou a meia-noite UTC exata com que o
// Prisma devolve um @db.Date (e com que o painel grava um <input type="date">).
// Formatado no fuso do navegador, ele caía no dia anterior no Brasil (UTC−3).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const UTC_MIDNIGHT_ISO = /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/

function isCivilDate(date: string | Date): boolean {
  if (typeof date === 'string') return DATE_ONLY.test(date) || UTC_MIDNIGHT_ISO.test(date)
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: isCivilDate(date) ? 'UTC' : BRAZIL_TIME_ZONE,
  }).format(new Date(date))
}

// ─── Máscaras de documento e CEP ─────────────────────────────────────────────
// Movidas de EntityModals.tsx para reuso em qualquer formulário do painel.

export function maskDocument(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    if (d.length > 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    if (d.length > 6) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    if (d.length > 3) return `${d.slice(0, 3)}.${d.slice(3)}`
    return d
  }
  if (d.length > 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`
  return d
}

export function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length > 5) return `${d.slice(0, 5)}-${d.slice(5)}`
  return d
}

// Telefone BR: fixo (11) 3456-7890 e celular (11) 98765-4321. O DDI 55,
// quando colado junto ("+55 11 9…"), e o zero de longa distância ("011 9…")
// saem — o cadastro guarda só DDD + número. 0800/0300 têm formato próprio.
const SERVICE_NUMBER = /^0[3589]00/

function phoneDigits(v: string): string {
  let d = v.replace(/\D/g, '')
  if (SERVICE_NUMBER.test(d)) return d
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  return d.replace(/^0+/, '')
}

export function maskPhone(v: string): string {
  const d = phoneDigits(v).slice(0, 11)
  if (d.length === 0) return ''
  if (SERVICE_NUMBER.test(d)) {
    return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(' ')
  }
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const rest = d.slice(2)
  if (rest.length <= 4) return `(${ddd}) ${rest}`
  // Até 10 dígitos é fixo (4+4); o 11º dígito vira celular (5+4)
  const split = d.length === 11 ? 5 : 4
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
}

/** Telefone já gravado (cadastro, Protheus); formato desconhecido fica como veio */
export function formatPhoneDisplay(v: string | null | undefined): string {
  if (!v) return '—'
  const d = phoneDigits(v)
  if (d.length === 10 || d.length === 11) return maskPhone(d)
  return v
}

export function formatDocumentDisplay(v: string | null): string {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

export function formatCEPDisplay(v: string | null): string {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return v
}
