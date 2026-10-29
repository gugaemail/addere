import axios from 'axios'
import { prisma } from '@addere/db'
import type { UsdBrlRateDto } from '@addere/types'
import { captureError } from '../../lib/sentry'

// Câmbio do custo de IA: PTAX venda do Banco Central (API Olinda, pública e
// sem chave). A cotação fica em billing_settings e é renovada no máximo a
// cada 6 horas; se o BCB não responder, vale a última que deu certo.

const PTAX_URL =
  'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
  'CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
const REFRESH_MS = 6 * 60 * 60 * 1000
// Depois de uma falha, só tenta de novo em 15 min — senão toda abertura da
// tela esperaria o timeout do BCB
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000
// Fim de semana e feriado não têm PTAX: a janela cobre o feriado mais longo
const LOOKBACK_DAYS = 10
const TIMEOUT_MS = 5000

const SP_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

let inflight: Promise<UsdBrlRateDto> | null = null
let lastFailureAt = 0

/** 'MM-DD-YYYY' em São Paulo, o formato que a API do BCB pede */
function bcbDate(date: Date): string {
  return SP_DATE.format(date).replace(/\//g, '-')
}

/** Cotação mais recente da janela. Lança se o BCB falhar ou não trouxer nenhuma. */
export async function fetchPtax(now: Date): Promise<{ rate: number; quotedAt: Date }> {
  const start = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const url =
    `${PTAX_URL}?@dataInicial='${bcbDate(start)}'&@dataFinalCotacao='${bcbDate(now)}'` +
    '&$format=json&$select=cotacaoVenda,dataHoraCotacao'
  const { data } = await axios.get<{ value?: unknown }>(url, { timeout: TIMEOUT_MS })

  const quotes = (Array.isArray(data?.value) ? data.value : [])
    .map((row) => row as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown })
    .filter(
      (row): row is { cotacaoVenda: number; dataHoraCotacao: string } =>
        typeof row.cotacaoVenda === 'number' &&
        row.cotacaoVenda > 0 &&
        typeof row.dataHoraCotacao === 'string'
    )
    .sort((a, b) => a.dataHoraCotacao.localeCompare(b.dataHoraCotacao))
  const last = quotes.at(-1)
  if (!last) throw new Error('PTAX sem cotação nos últimos dias')

  // "2026-10-29 13:11:53.555689", horário de Brasília (sem horário de verão)
  const quotedAt = new Date(`${last.dataHoraCotacao.slice(0, 19).replace(' ', 'T')}-03:00`)
  return { rate: last.cotacaoVenda, quotedAt }
}

async function refresh(now: Date, stored: UsdBrlRateDto | null): Promise<UsdBrlRateDto> {
  try {
    const { rate, quotedAt } = await fetchPtax(now)
    const data = { usdBrlRate: rate, usdBrlRateAt: quotedAt, usdBrlFetchedAt: now }
    await prisma.billingSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...data },
      update: data,
    })
    return { rate, quotedAt: quotedAt.toISOString(), stale: false }
  } catch (err) {
    lastFailureAt = now.getTime()
    captureError(err, { where: 'usd-brl' })
    return stored ? { ...stored, stale: true } : { rate: null, quotedAt: null, stale: true }
  }
}

export async function getUsdBrlRate(now: Date = new Date()): Promise<UsdBrlRateDto> {
  const settings = await prisma.billingSettings.findUnique({
    where: { id: 'global' },
    select: { usdBrlRate: true, usdBrlRateAt: true, usdBrlFetchedAt: true },
  })
  const stored: UsdBrlRateDto | null = settings?.usdBrlRate
    ? {
        rate: Number(settings.usdBrlRate),
        quotedAt: settings.usdBrlRateAt?.toISOString() ?? null,
        stale: false,
      }
    : null

  const fetchedAt = settings?.usdBrlFetchedAt?.getTime() ?? 0
  if (stored && now.getTime() - fetchedAt < REFRESH_MS) return stored
  if (now.getTime() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
    return stored ? { ...stored, stale: true } : { rate: null, quotedAt: null, stale: true }
  }

  // Duas telas abertas ao mesmo tempo fazem uma consulta só
  inflight ??= refresh(now, stored).finally(() => {
    inflight = null
  })
  return inflight
}

/** Só para os testes: zera o estado em memória entre os casos */
export function resetUsdBrlState(): void {
  inflight = null
  lastFailureAt = 0
}
