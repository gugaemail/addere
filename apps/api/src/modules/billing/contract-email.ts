import { CONTRACT_DOCUMENT_KIND_LABELS, type ContractDocumentKind } from '@addere/types'
import { escapeHtml, sendBillingEmail, webUrl } from './billing-mailer'

// Os dois e-mails do contrato (plano 014). Nenhum leva o texto do contrato, o
// IP nem o navegador: o documento é lido no painel, pelo link.

const SUBJECT_TITLE: Record<ContractDocumentKind, string> = {
  CONTRACT: 'Contrato de Licença de Uso do Addere',
  AMENDMENT: 'Aditivo ao Contrato de Licença de Uso do Addere',
}

function layout(paragraphs: string[], link: string, linkLabel: string): string {
  return [
    ...paragraphs.map((p) => `<p>${p}</p>`),
    `<p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p>`,
    '<p>Addere</p>',
  ].join('\n')
}

let brasiliaFormatter: Intl.DateTimeFormat | null = null

function brasilia(instant: Date): string {
  brasiliaFormatter ??= new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return brasiliaFormatter.format(instant)
}

/**
 * Pede o aceite. Um destinatário só, o administrador indicado (decisão de
 * desenho 10): sem cópia ao billingEmail nem aos outros ADMINs, que não têm o
 * que fazer com o link. Devolve se o e-mail saiu.
 */
export async function sendDocumentPendingEmail(
  doc: { id: string; kind: ContractDocumentKind },
  recipient: { name: string; email: string }
): Promise<boolean> {
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  return sendBillingEmail({
    to: recipient.email,
    subject: `${SUBJECT_TITLE[doc.kind]} aguardando seu aceite`,
    html: layout(
      [
        `Olá, ${escapeHtml(recipient.name)}.`,
        `A Addere enviou o ${escapeHtml(label)} da sua empresa para você ler e aceitar no painel do Addere. Você é o administrador indicado pela sua empresa para esse aceite.`,
        'Para ler o texto inteiro e aceitar, entre no painel pelo link abaixo.',
      ],
      webUrl(`/contrato/${doc.id}`),
      `Ler e aceitar o ${label}`
    ),
  })
}

/**
 * Confirma o aceite: quem aceitou e quando, sem IP e sem o texto. Um envio por
 * endereço (quem chama já tirou os repetidos e os vazios). Devolve quantos
 * e-mails saíram.
 */
export async function sendDocumentAcceptedEmail(
  doc: { id: string; kind: ContractDocumentKind; acceptedAt: Date; acceptedByName: string },
  recipients: string[]
): Promise<number> {
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  const html = layout(
    [
      `O ${escapeHtml(label)} foi aceito no painel do Addere por ${escapeHtml(doc.acceptedByName)}, em ${escapeHtml(brasilia(doc.acceptedAt))} (horário de Brasília).`,
      'O documento aceito, com o registro do aceite, fica disponível no painel, onde também pode ser impresso ou salvo em PDF.',
    ],
    webUrl(`/contrato/${doc.id}`),
    `Ver o ${label}`
  )
  let sent = 0
  for (const to of recipients) {
    if (await sendBillingEmail({ to, subject: `${SUBJECT_TITLE[doc.kind]} aceito`, html })) sent++
  }
  return sent
}
