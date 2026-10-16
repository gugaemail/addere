import { Resend } from 'resend'
import { CONTRATADA } from '@addere/types'
import { env } from '../../lib/env'
import { captureError } from '../../lib/sentry'

// Envio de e-mail da Gestão Addere (plano 014), no padrão do reset de senha
// (auth.service.ts). O 015 e o 016 acrescentam aqui as funções deles.
//
// Diferenças de propósito: sem RESEND_API_KEY o envio só avisa e devolve
// false, sem erro (o contrato enviado continua válido e o superadmin reenvia
// depois); e todo texto vindo do banco passa por escapeHtml antes de entrar no
// HTML. Nada de dado pessoal no log nem no Sentry: nem o destinatário, nem o
// assunto, nem a mensagem de erro do Resend (que pode citar o endereço).

const FALLBACK_WEB_URL = 'https://addere-web.vercel.app' // o mesmo do auth.service.ts

/** URL do painel com o caminho: WEB_URL do ambiente, com o mesmo fallback do reset de senha */
export function webUrl(path: string): string {
  const base = (env.WEB_URL ?? FALLBACK_WEB_URL).replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Texto do banco → seguro dentro do HTML do e-mail */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Um destinatário por chamada (ninguém vê o endereço de ninguém). Devolve se o
 * e-mail saiu. O SDK do Resend 4.x DEVOLVE `{ data, error }` em vez de lançar
 * quando a API recusa: o `error` é conferido.
 */
export async function sendBillingEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('[billing] RESEND_API_KEY não configurada — e-mail não enviado')
    return false
  }
  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: 'Addere <noreply@addere.com.br>',
      to: [input.to],
      replyTo: CONTRATADA.emailContato,
      subject: input.subject,
      html: input.html,
    })
    if (error) {
      captureError(new Error(`Resend recusou o envio: ${error.name}`), {
        module: 'billing',
        op: 'send-email',
      })
      return false
    }
    return true
  } catch (err) {
    captureError(err, { module: 'billing', op: 'send-email' })
    return false
  }
}
