import { CONTRATADA } from '@addere/types'

// Layout único dos e-mails do Addere (reset de senha e Gestão Addere): HTML de
// tabela com estilo inline, que é o que Gmail, Outlook e os webmails respeitam,
// e sempre com a versão em texto puro ao lado. E-mail só em HTML, sem estrutura
// de documento e com um link só pesa contra nos filtros de spam (SpamAssassin:
// MIME_HTML_ONLY e parentes); o rodapé com quem envia, o endereço e o motivo do
// envio pesa a favor.
//
// Sem imagem de propósito: muitos clientes bloqueiam imagem por padrão, e o
// logo vira um quadrado vazio. A marca vai em texto.

// Os tokens de apps/web/src/lib/brand-tokens.ts (BRAND e EMAIL_PALETTE): a API
// não importa do web, e e-mail não lê classe Tailwind nem variável CSS
const COLORS = {
  primary: '#1B4FA8',
  accent: '#29BEFF',
  navy: '#0D2045',
  tint: '#E8F4FF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  white: '#FFFFFF',
  textBody: '#334155',
  textSecondary: '#475569',
  muted: '#64748B',
} as const

const FONT_BODY = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const FONT_HEADING = "'Plus Jakarta Sans', Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Texto do banco → seguro dentro do HTML do e-mail */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** HTML seguro (só tags simples, como <strong>) → texto puro da versão sem HTML */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export interface EmailContent {
  /** Resumo que a caixa de entrada mostra ao lado do assunto (texto puro) */
  preheader: string
  /** Título do corpo (texto puro) */
  heading: string
  /** Parágrafos em HTML seguro: quem chama já escapou o que veio do banco */
  paragraphs: string[]
  /** Quadro de rótulo e valor, em texto puro (escapado aqui) */
  details?: Array<[label: string, value: string]>
  /** O botão: o link do painel */
  action?: { label: string; url: string }
  /** Parágrafos depois do botão, em HTML seguro */
  closing?: string[]
  /** Por que a pessoa recebeu este e-mail (texto puro), no rodapé */
  reason: string
}

export interface RenderedEmail {
  html: string
  text: string
}

function paragraphHtml(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:24px;color:${COLORS.textBody};">${html}</p>`
}

function detailsHtml(rows: Array<[string, string]>): string {
  const cells = rows
    .map(
      ([label, value], i) =>
        `<tr>` +
        `<td style="padding:10px 16px;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${COLORS.muted};vertical-align:top;width:40%;">${escapeHtml(label)}</td>` +
        `<td style="padding:10px 16px;${i > 0 ? `border-top:1px solid ${COLORS.border};` : ''}font-family:${FONT_BODY};font-size:14px;line-height:20px;color:${COLORS.navy};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>` +
        `</tr>`
    )
    .join('')
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:0 0 24px;border-collapse:separate;background:${COLORS.tint};border-radius:10px;">${cells}</table>`
  )
}

function actionHtml(action: { label: string; url: string }): string {
  const url = escapeHtml(action.url)
  // Botão "à prova de bala": a célula pintada leva a cor mesmo no Outlook, que
  // ignora padding e border-radius no <a>
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">` +
    `<tr><td align="center" bgcolor="${COLORS.primary}" style="border-radius:10px;background:${COLORS.primary};">` +
    `<a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT_BODY};font-size:15px;line-height:20px;font-weight:600;color:${COLORS.white};text-decoration:none;border-radius:10px;">${escapeHtml(action.label)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 24px;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${COLORS.muted};">` +
    `Se o botão não abrir, copie e cole este endereço no navegador:<br>` +
    `<a href="${url}" target="_blank" style="color:${COLORS.primary};word-break:break-all;">${url}</a></p>`
  )
}

function footerHtml(reason: string): string {
  const contato = escapeHtml(CONTRATADA.emailContato)
  const lines = [
    escapeHtml(reason),
    `Dúvidas: responda este e-mail ou escreva para <a href="mailto:${contato}" style="color:${COLORS.primary};text-decoration:none;">${contato}</a>.`,
    `${escapeHtml(CONTRATADA.razaoSocial)} · CNPJ ${escapeHtml(CONTRATADA.cnpj)}<br>${escapeHtml(CONTRATADA.endereco)}`,
  ]
  return lines
    .map(
      (l) =>
        `<p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:12px;line-height:18px;color:${COLORS.muted};">${l}</p>`
    )
    .join('')
}

function renderHtml(c: EmailContent): string {
  const body = [
    `<h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:20px;line-height:28px;font-weight:700;color:${COLORS.navy};">${escapeHtml(c.heading)}</h1>`,
    ...c.paragraphs.map(paragraphHtml),
    c.details?.length ? detailsHtml(c.details) : '',
    c.action ? actionHtml(c.action) : '',
    ...(c.closing ?? []).map(paragraphHtml),
  ].join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.surface};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.surface}" style="background:${COLORS.surface};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;font-family:${FONT_HEADING};font-size:22px;line-height:28px;font-weight:800;color:${COLORS.navy};letter-spacing:-0.3px;">Addere<span style="color:${COLORS.accent};">.</span></td></tr>
<tr><td bgcolor="${COLORS.white}" style="background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="4" bgcolor="${COLORS.primary}" style="height:4px;line-height:4px;font-size:0;background:${COLORS.primary};background-image:linear-gradient(90deg,${COLORS.primary},${COLORS.accent});border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 16px;">${body}</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 4px 0;">${footerHtml(c.reason)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function renderText(c: EmailContent): string {
  const blocks: string[] = [c.heading, ...c.paragraphs.map(htmlToText)]
  if (c.details?.length) blocks.push(c.details.map(([l, v]) => `${l}: ${v}`).join('\n'))
  if (c.action) blocks.push(`${c.action.label}:\n${c.action.url}`)
  blocks.push(...(c.closing ?? []).map(htmlToText))
  blocks.push(
    '—',
    [
      c.reason,
      `Dúvidas: responda este e-mail ou escreva para ${CONTRATADA.emailContato}.`,
      `${CONTRATADA.razaoSocial} · CNPJ ${CONTRATADA.cnpj}`,
      CONTRATADA.endereco,
    ].join('\n')
  )
  return blocks.join('\n\n') + '\n'
}

/** O e-mail no padrão do Addere: HTML e texto puro, do mesmo conteúdo */
export function renderEmail(content: EmailContent): RenderedEmail {
  return { html: renderHtml(content), text: renderText(content) }
}
