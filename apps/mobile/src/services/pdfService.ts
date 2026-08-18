import * as Print from 'expo-print'
import type { Order } from '@addere/types'
import { STATUS_LABEL } from '../utils/orderStatus'
import { fmtData } from '../utils/format'
import { colors } from '../theme'

function fmtDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function buildHtml(order: Order): string {
  const emissao = order.emissao ?? order.createdAt
  const dateFormatted = fmtData(emissao)
  const generatedAt = fmtData(new Date().toISOString())
  const generatedTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const statusLabel = STATUS_LABEL[order.status] ?? order.status

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.product.name}</td>
        <td>${item.descricao ?? '—'}</td>
        <td style="text-align:center">${item.product.unit}</td>
        <td class="num">${fmtDecimal(item.quantity)}</td>
        <td class="num">R$ ${fmtDecimal(item.unitPrice)}</td>
        <td class="num">${fmtDecimal(item.discount)}%</td>
        <td class="num"><strong>R$ ${fmtDecimal(item.total)}</strong></td>
      </tr>
    `
    )
    .join('')

  const branchBlock = order.branch
    ? `<p>Filial: <strong>${order.branch.name}</strong></p>`
    : ''
  const transportBlock = order.transportadora
    ? `<p>Transportadora: <strong>${order.transportadora.nome}</strong></p>`
    : ''
  const condPagBlock = order.condPag
    ? `<p>Cond. Pagamento: <strong>${order.condPag.nome}</strong></p>`
    : ''
  const protheusBlock = order.protheusOrderId
    ? `<p>Cód. Protheus: <strong>${order.protheusOrderId}</strong></p>`
    : ''
  const documentBlock = order.customer.document
    ? `<p>${order.customer.document}</p>`
    : ''
  const observacoesBlock =
    order.notes || order.mennota
      ? `
    <div class="obs-box">
      <p class="label-sm">Observações</p>
      <p>${order.notes ?? order.mennota}</p>
    </div>`
      : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: ${colors.neutral.text};
      padding: 28px 32px;
      font-size: 12px;
      background: ${colors.neutral.white};
    }

    /* ── Cabeçalho ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 16px;
      border-bottom: 2px solid ${colors.brand.primary};
      margin-bottom: 20px;
    }
    .logo { font-size: 26px; font-weight: 800; color: ${colors.brand.dark}; letter-spacing: -1px; }
    .logo span { color: ${colors.brand.accent}; }
    .order-meta { text-align: right; }
    .order-meta h2 { font-size: 16px; font-weight: 700; color: ${colors.brand.dark}; margin-bottom: 4px; }
    .order-meta p { color: ${colors.neutral.textSub}; font-size: 11px; line-height: 1.6; }
    .status-pill {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: ${colors.brand.tint};
      color: ${colors.brand.primary};
      border: 1px solid ${colors.brand.accent};
    }

    /* ── Info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }
    .info-card {
      background: ${colors.neutral.bg};
      border: 1px solid ${colors.neutral.border};
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-card .label-sm {
      font-size: 10px;
      font-weight: 700;
      color: ${colors.neutral.placeholder};
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 6px;
    }
    .info-card p {
      font-size: 12px;
      color: ${colors.neutral.text};
      line-height: 1.7;
    }
    .info-card strong { color: ${colors.brand.dark}; }

    /* ── Tabela de produtos ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 11px;
    }
    thead tr {
      background: ${colors.brand.dark};
    }
    thead th {
      color: ${colors.neutral.white};
      padding: 8px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    thead th.num { text-align: right; }
    tbody tr:nth-child(even) td { background: ${colors.neutral.bg}; }
    tbody td {
      padding: 8px 10px;
      border-bottom: 1px solid ${colors.neutral.border};
      color: ${colors.neutral.text};
    }
    .num { text-align: right; }

    /* ── Totais ── */
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 20px;
    }
    .totals-box {
      min-width: 220px;
      border: 1px solid ${colors.neutral.border};
      border-radius: 8px;
      overflow: hidden;
    }
    .totals-total {
      display: flex;
      justify-content: space-between;
      padding: 10px 14px;
      background: ${colors.brand.dark};
      color: ${colors.neutral.white};
      font-size: 14px;
      font-weight: 700;
    }

    /* ── Observações ── */
    .obs-box {
      background: ${colors.neutral.bg};
      border: 1px solid ${colors.neutral.border};
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 20px;
    }
    .obs-box .label-sm {
      font-size: 10px;
      font-weight: 700;
      color: ${colors.neutral.placeholder};
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 6px;
    }

    /* ── Rodapé ── */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 14px;
      border-top: 1px solid ${colors.neutral.border};
      font-size: 10px;
      color: ${colors.neutral.placeholder};
    }
    .footer-watermark {
      font-size: 13px;
      font-weight: 800;
      color: ${colors.brand.dark};
      opacity: 0.15;
      letter-spacing: -0.5px;
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="logo">Add<span>ere</span></div>
    <div class="order-meta">
      <h2>Pedido de Venda</h2>
      <p>Data de emissão: ${dateFormatted}</p>
      ${protheusBlock}
      <span class="status-pill">${statusLabel}</span>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <p class="label-sm">Cliente</p>
      <p><strong>${order.customer.name}</strong></p>
      ${documentBlock}
    </div>
    <div class="info-card">
      <p class="label-sm">Detalhes</p>
      ${branchBlock}
      ${transportBlock}
      ${condPagBlock}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Produto</th>
        <th>Descrição</th>
        <th style="text-align:center">Un.</th>
        <th class="num">Qtd</th>
        <th class="num">Preço Unit.</th>
        <th class="num">Desc.</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals-wrapper">
    <div class="totals-box">
      <div class="totals-total">
        <span>Total</span>
        <span>R$ ${fmtDecimal(order.total)}</span>
      </div>
    </div>
  </div>

  ${observacoesBlock}

  <div class="footer">
    <span>Gerado em ${generatedAt} às ${generatedTime}</span>
    <span class="footer-watermark">Addere</span>
  </div>

</body>
</html>`
}

export async function generateOrderPdf(order: Order): Promise<string> {
  const html = buildHtml(order)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
  return uri
}
