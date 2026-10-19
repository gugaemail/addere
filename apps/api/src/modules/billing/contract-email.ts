import { CONTRACT_DOCUMENT_KIND_LABELS, type ContractDocumentKind } from '@addere/types'
import { escapeHtml, renderEmail } from '../../lib/email-layout'
import { sendBillingEmail, webUrl, type BillingEmail } from './billing-mailer'

// Os dois e-mails do contrato (plano 014). Nenhum leva o texto do contrato, o
// IP nem o navegador: o documento é lido no painel, pelo link.

const SUBJECT_TITLE: Record<ContractDocumentKind, string> = {
  CONTRACT: 'Contrato de Licença de Uso do Addere',
  AMENDMENT: 'Aditivo ao Contrato de Licença de Uso do Addere',
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

/** O pedido de aceite: o modelo, separado do envio */
export function documentPendingEmail(
  doc: { id: string; kind: ContractDocumentKind },
  recipientName: string
): BillingEmail {
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  return {
    subject: `${SUBJECT_TITLE[doc.kind]} aguardando seu aceite`,
    ...renderEmail({
      preheader: `Leia e aceite o ${label} da sua empresa no painel do Addere.`,
      heading: `${label} para o seu aceite`,
      paragraphs: [
        `Olá, ${escapeHtml(recipientName)}.`,
        `A Addere enviou o ${escapeHtml(label)} da sua empresa para você ler e aceitar no painel do Addere. Você é o administrador indicado pela sua empresa para esse aceite.`,
        'O texto inteiro fica no painel. Se estiver de acordo, marque “Li e concordo” e clique em Aceitar: o aceite fica registrado com o seu nome, a data e a hora, e o documento aceito pode ser impresso ou salvo em PDF.',
      ],
      action: { label: 'Ler e aceitar no painel', url: webUrl(`/contrato/${doc.id}`) },
      closing: ['Para entrar, use o seu e-mail e a sua senha do painel do Addere.'],
      reason:
        'Você recebeu este e-mail porque é o administrador indicado pela sua empresa para aceitar o contrato do Addere.',
    }),
  }
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
  return sendBillingEmail({ to: recipient.email, ...documentPendingEmail(doc, recipient.name) })
}

type AcceptedDocument = {
  id: string
  kind: ContractDocumentKind
  acceptedAt: Date
  acceptedByName: string
}

/** A confirmação do aceite: quem aceitou e quando, sem IP e sem o texto */
export function documentAcceptedEmail(doc: AcceptedDocument): BillingEmail {
  const label = CONTRACT_DOCUMENT_KIND_LABELS[doc.kind]
  const when = brasilia(doc.acceptedAt)
  return {
    subject: `${SUBJECT_TITLE[doc.kind]} aceito`,
    ...renderEmail({
      preheader: `${doc.acceptedByName} aceitou o ${label} em ${when}.`,
      heading: `${label} aceito`,
      paragraphs: [
        `O ${escapeHtml(label)} foi aceito no painel do Addere por ${escapeHtml(doc.acceptedByName)}, em ${escapeHtml(when)} (horário de Brasília).`,
      ],
      details: [
        ['Aceito por', doc.acceptedByName],
        ['Data e hora', `${when} (Brasília)`],
      ],
      action: { label: `Ver o ${label}`, url: webUrl(`/contrato/${doc.id}`) },
      closing: [
        'O documento aceito, com o registro do aceite, fica disponível no painel, onde também pode ser impresso ou salvo em PDF.',
      ],
      reason: 'Você recebeu este e-mail porque acompanha o contrato desta empresa no Addere.',
    }),
  }
}

/**
 * Confirma o aceite. Um envio por endereço (quem chama já tirou os repetidos e
 * os vazios). Devolve quantos e-mails saíram.
 */
export async function sendDocumentAcceptedEmail(
  doc: AcceptedDocument,
  recipients: string[]
): Promise<number> {
  const email = documentAcceptedEmail(doc)
  let sent = 0
  for (const to of recipients) {
    if (await sendBillingEmail({ to, ...email })) sent++
  }
  return sent
}
