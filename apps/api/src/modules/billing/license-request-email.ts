import { formatBrl } from '@addere/types'
import { escapeHtml, renderEmail } from '../../lib/email-layout'
import { sendBillingEmail, webUrl } from './billing-mailer'

// Aviso à Addere de um pedido de licenças adicionais (plano 015), no molde do
// contract-email.ts. Vai para o notifyEmail das regras de cobrança. Todo valor
// dinâmico é escapado; sem IP e sem navegador, que ficam só no pedido.

export interface LicenseRequestEmail {
  companyName: string
  requestedByName: string
  requestedByEmail: string
  quantity: number
  unitPrice: string // '99.00'
  monthlyIncrease: string // '198.00'
  declarationText: string
  message: string | null
}

export function licenseRequestSubject(quantity: number, companyName: string): string {
  return `Pedido de ${quantity} ${quantity === 1 ? 'licença' : 'licenças'} — ${companyName}`
}

/** Monta e envia. Devolve se o e-mail saiu; quem chama decide o que fazer sem ele. */
export async function sendLicenseRequestEmail(
  to: string,
  req: LicenseRequestEmail
): Promise<boolean> {
  const rows: [string, string][] = [
    ['Empresa', req.companyName],
    ['Pedido por', `${req.requestedByName} (${req.requestedByEmail})`],
    ['Quantidade', String(req.quantity)],
    ['Valor por licença', `${formatBrl(req.unitPrice)} por mês`],
    ['Aumento mensal', formatBrl(req.monthlyIncrease)],
  ]
  return sendBillingEmail({
    to,
    subject: licenseRequestSubject(req.quantity, req.companyName),
    ...renderEmail({
      preheader: `${req.companyName} pediu ${req.quantity} ${req.quantity === 1 ? 'licença adicional' : 'licenças adicionais'}.`,
      heading: 'Pedido de licenças adicionais',
      paragraphs: ['Um administrador indicado pediu licenças adicionais no painel do Addere.'],
      details: rows,
      closing: [
        `Declaração aceita: “${escapeHtml(req.declarationText)}”`,
        ...(req.message ? [`Mensagem: ${escapeHtml(req.message)}`] : []),
      ],
      action: { label: 'Abrir solicitações', url: webUrl('/gestao/solicitacoes') },
      reason:
        'Você recebeu este e-mail porque é o endereço de avisos das regras de cobrança da Gestão Addere.',
    }),
  })
}
