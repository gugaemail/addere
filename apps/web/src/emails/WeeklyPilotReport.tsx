import {
  Html, Head, Body, Container, Section, Heading, Text,
  Row, Column, Hr, Link, Preview,
} from '@react-email/components'
import { BRAND, EMAIL_PALETTE as P } from '@/lib/brand-tokens'

interface Metric {
  current: number | null
  previous: number | null
}

interface WeeklyReportData {
  clientName: string
  weekNumber: number
  período: { start: string; end: string }
  métricas: {
    avgOrderDuration: Metric
    syncSuccessRate: Metric
    offlineOrderRate: Metric
    avgQueueDuration: Metric
    totalOrders: Metric
  }
  highlights: string[]
  feedbacks: {
    positive: number
    negative: number
    comments: (string | null)[]
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}min ${secs % 60}s`
}

function formatPercent(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

function delta(cur: number | null, prev: number | null, invert = false): string {
  if (cur === null || prev === null || prev === 0) return ''
  const pct = Math.round(((cur - prev) / prev) * 100)
  const positive = invert ? pct < 0 : pct > 0
  return `${positive ? '↑' : '↓'} ${Math.abs(pct)}%`
}

interface MetricRowProps {
  label: string
  value: string
  goal: string
  deltaStr: string
  met: boolean | null
}

function MetricRow({ label, value, goal, deltaStr, met }: MetricRowProps) {
  const color = met === null ? BRAND.muted : met ? BRAND.success : BRAND.danger
  return (
    <Row style={{ marginBottom: 8 }}>
      <Column style={{ width: '40%' }}>
        <Text style={{ margin: 0, fontSize: 13, color: P.textSecondary }}>{label}</Text>
      </Column>
      <Column style={{ width: '25%' }}>
        <Text style={{ margin: 0, fontSize: 14, fontWeight: 'bold', color }}>{value}</Text>
      </Column>
      <Column style={{ width: '20%' }}>
        <Text style={{ margin: 0, fontSize: 12, color: P.textMuted }}>Meta: {goal}</Text>
      </Column>
      <Column style={{ width: '15%' }}>
        <Text style={{ margin: 0, fontSize: 12, color: BRAND.muted }}>{deltaStr}</Text>
      </Column>
    </Row>
  )
}

export function WeeklyPilotReport({ report }: { report: WeeklyReportData }) {
  const { métricas: m } = report
  const syncMet = m.syncSuccessRate.current !== null ? m.syncSuccessRate.current >= 98 : null
  const avgMet = m.avgOrderDuration.current !== null ? m.avgOrderDuration.current <= 300_000 : null
  const offlineMet = m.offlineOrderRate.current !== null ? m.offlineOrderRate.current >= 50 : null
  const queueMet = m.avgQueueDuration.current !== null ? m.avgQueueDuration.current <= 30_000 : null

  return (
    <Html>
      <Head />
      <Preview>{`Relatório semanal — ${report.clientName} — Semana ${report.weekNumber}`}</Preview>
      <Body style={{ backgroundColor: BRAND.surface, fontFamily: 'Inter, Helvetica, Arial, sans-serif' }}>
        <Container style={{ maxWidth: 580, margin: '0 auto', padding: '32px 16px' }}>
          {/* Header */}
          <Section style={{ backgroundColor: BRAND.navy, borderRadius: 12, padding: '24px 28px', marginBottom: 24 }}>
            <Heading style={{ margin: 0, color: P.white, fontSize: 22, fontWeight: 700 }}>
              addere
            </Heading>
            <Text style={{ margin: '8px 0 0', color: P.textMuted, fontSize: 14 }}>
              Relatório semanal · {report.clientName} · Semana {report.weekNumber}
            </Text>
            <Text style={{ margin: '4px 0 0', color: BRAND.muted, fontSize: 12 }}>
              {new Date(report.período.start).toLocaleDateString('pt-BR')} a{' '}
              {new Date(report.período.end).toLocaleDateString('pt-BR')}
            </Text>
          </Section>

          {/* Destaque principal */}
          <Section style={{ backgroundColor: BRAND.primary, borderRadius: 12, padding: '20px 28px', marginBottom: 24, textAlign: 'center' }}>
            <Text style={{ margin: 0, color: BRAND.tint, fontSize: 13 }}>Total de pedidos na semana</Text>
            <Text style={{ margin: '4px 0 0', color: P.white, fontSize: 42, fontWeight: 700 }}>
              {m.totalOrders.current ?? 0}
            </Text>
            {m.totalOrders.previous !== null && (
              <Text style={{ margin: '4px 0 0', color: P.brandSoft, fontSize: 13 }}>
                {delta(m.totalOrders.current, m.totalOrders.previous)} vs semana anterior
              </Text>
            )}
          </Section>

          {/* Métricas */}
          <Section style={{ backgroundColor: P.white, borderRadius: 12, padding: '20px 28px', marginBottom: 24 }}>
            <Heading as="h2" style={{ margin: '0 0 16px', fontSize: 15, color: BRAND.navy, fontWeight: 600 }}>
              Métricas da semana
            </Heading>
            <MetricRow
              label="⏱ Tempo médio/pedido"
              value={formatDuration(m.avgOrderDuration.current)}
              goal="< 5 min"
              deltaStr={delta(m.avgOrderDuration.current, m.avgOrderDuration.previous, true)}
              met={avgMet}
            />
            <Hr style={{ borderColor: P.divider, margin: '8px 0' }} />
            <MetricRow
              label="📶 Taxa de sincronização"
              value={formatPercent(m.syncSuccessRate.current)}
              goal="> 98%"
              deltaStr={delta(m.syncSuccessRate.current, m.syncSuccessRate.previous)}
              met={syncMet}
            />
            <Hr style={{ borderColor: P.divider, margin: '8px 0' }} />
            <MetricRow
              label="📱 Pedidos em campo"
              value={formatPercent(m.offlineOrderRate.current)}
              goal="> 50%"
              deltaStr={delta(m.offlineOrderRate.current, m.offlineOrderRate.previous)}
              met={offlineMet}
            />
            <Hr style={{ borderColor: P.divider, margin: '8px 0' }} />
            <MetricRow
              label="⚡ Tempo médio de sync"
              value={formatDuration(m.avgQueueDuration.current)}
              goal="< 30s"
              deltaStr={delta(m.avgQueueDuration.current, m.avgQueueDuration.previous, true)}
              met={queueMet}
            />
          </Section>

          {/* Destaques */}
          {report.highlights.length > 0 && (
            <Section style={{ backgroundColor: P.infoBg, borderRadius: 12, padding: '20px 28px', marginBottom: 24 }}>
              <Heading as="h2" style={{ margin: '0 0 12px', fontSize: 15, color: BRAND.navy, fontWeight: 600 }}>
                Destaques da semana
              </Heading>
              {report.highlights.map((h, i) => (
                <Text key={i} style={{ margin: '0 0 8px', fontSize: 13, color: P.textBody, lineHeight: '1.5' }}>
                  • {h}
                </Text>
              ))}
            </Section>
          )}

          {/* Feedbacks negativos */}
          {report.feedbacks.negative > 0 && (
            <Section style={{ backgroundColor: P.dangerBg, border: `1px solid ${P.dangerBorder}`, borderRadius: 12, padding: '20px 28px', marginBottom: 24 }}>
              <Heading as="h2" style={{ margin: '0 0 8px', fontSize: 15, color: P.dangerText, fontWeight: 600 }}>
                Feedbacks negativos ({report.feedbacks.negative})
              </Heading>
              <Text style={{ margin: '0 0 12px', fontSize: 12, color: P.textMuted }}>
                Feedbacks positivos: {report.feedbacks.positive}
              </Text>
              {report.feedbacks.comments.filter(Boolean).map((c, i) => (
                <Text key={i} style={{ margin: '0 0 8px', fontSize: 13, color: P.dangerTextDim, fontStyle: 'italic' }}>
                  &ldquo;{c}&rdquo;
                </Text>
              ))}
            </Section>
          )}

          {/* CTA */}
          <Section style={{ textAlign: 'center', marginBottom: 24 }}>
            <Link
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://admin.addere.com.br'}/piloto`}
              style={{
                backgroundColor: BRAND.primary,
                color: P.white,
                padding: '12px 28px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Ver dashboard completo →
            </Link>
          </Section>

          {/* Footer */}
          <Section style={{ textAlign: 'center' }}>
            <Text style={{ margin: 0, fontSize: 12, color: P.textMuted }}>
              Addere ERP Mobile · Relatório gerado automaticamente
            </Text>
            <Text style={{ margin: '4px 0 0', fontSize: 12, color: P.textMuted }}>
              Dúvidas? Contate Gustavo via WhatsApp.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
