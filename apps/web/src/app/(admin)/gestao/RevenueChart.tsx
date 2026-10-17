'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatBrl, type RevenueMonth } from '@addere/types'
import { BRAND } from '@/lib/brand-tokens'
import { Card } from '@/components/ui/Card'
import { Table, type Column } from '@/components/ui/Table'
import { brlCompact, monthLongLabel, revenueChartData } from '@/lib/billing-dashboard'

// Receita dos 12 meses fechados (plano 018), no padrão do gráfico do piloto.
// As cores vêm de BRAND; o tracejado é a segunda codificação da série
// "Recebido" (não depende só da cor), e a tabela embaixo é a alternativa
// acessível ao gráfico e a compensação do contraste baixo do ciano.

const BILLED = 'Faturado (competência)'
const RECEIVED = 'Recebido (mês da baixa)'

const columns: Column<RevenueMonth>[] = [
  {
    key: 'month',
    header: 'Mês',
    className: 'whitespace-nowrap',
    render: (m) => monthLongLabel(m.month),
  },
  {
    key: 'billed',
    header: 'Faturado',
    className: 'text-right whitespace-nowrap tabular-nums',
    render: (m) => formatBrl(m.billed),
  },
  {
    key: 'received',
    header: 'Recebido',
    className: 'text-right whitespace-nowrap tabular-nums',
    render: (m) => formatBrl(m.received),
  },
]

export function RevenueChart({ data }: { data: RevenueMonth[] }) {
  const points = revenueChartData(data)

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
        Receita — últimos 12 meses fechados
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        {/* left: 0 — a margem negativa do piloto cortaria o rótulo em reais */}
        <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: BRAND.muted }} />
          <YAxis
            tick={{ fontSize: 11, fill: BRAND.muted }}
            tickFormatter={(v: number) => brlCompact(v)}
            width={72}
          />
          <Tooltip
            formatter={(value: number) => formatBrl(value)}
            labelFormatter={(_label, payload) => {
              const month = payload?.[0]?.payload?.month
              return typeof month === 'string' ? monthLongLabel(month) : ''
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="billed"
            name={BILLED}
            stroke={BRAND.primary}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="received"
            name={RECEIVED}
            stroke={BRAND.accent}
            strokeWidth={2}
            strokeDasharray="4 2"
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Ver os valores em tabela
        </summary>
        <div className="mt-3 rounded-xl border border-[var(--border)]">
          <Table columns={columns} data={data} rowKey={(m) => m.month} />
        </div>
      </details>
    </Card>
  )
}
