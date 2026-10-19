import { describe, expect, it } from 'vitest'
import { escapeHtml, htmlToText, renderEmail } from '../email-layout'

const content = {
  preheader: 'Leia e aceite o contrato.',
  heading: 'Contrato <para> o seu aceite',
  paragraphs: ['Olá, Ana &amp; Cia.', 'Prazo: <strong>25/10/2026</strong>.'],
  details: [['Empresa', 'Distribuidora <Norte>']] as Array<[string, string]>,
  action: { label: 'Ler e aceitar', url: 'https://admin.addere.com.br/contrato/1?a=1&b=2' },
  closing: ['Para entrar, use o seu e-mail.'],
  reason: 'Você recebeu este e-mail porque é o administrador indicado.',
}

describe('renderEmail', () => {
  it('HTML de documento inteiro, com o resumo da caixa de entrada', () => {
    const { html } = renderEmail(content)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('Leia e aceite o contrato.')
    expect(html).toContain('</body>\n</html>')
  })

  it('escapa o título, o quadro e o link; os parágrafos entram como vieram', () => {
    const { html } = renderEmail(content)
    expect(html).toContain('Contrato &lt;para&gt; o seu aceite')
    expect(html).toContain('Distribuidora &lt;Norte&gt;')
    expect(html).toContain('href="https://admin.addere.com.br/contrato/1?a=1&amp;b=2"')
    expect(html).toContain('<strong>25/10/2026</strong>')
    expect(html).not.toContain('<Norte>')
  })

  it('rodapé com o motivo, o contato e quem envia', () => {
    const { html, text } = renderEmail(content)
    for (const out of [html, text]) {
      expect(out).toContain('porque é o administrador indicado')
      expect(out).toContain('contato@addere.com.br')
      expect(out).toContain('GH ENGENHARIA LTDA - ME')
      expect(out).toContain('07.841.407/0001-90')
      expect(out).toContain('João Pessoa/PB')
    }
  })

  it('versão em texto puro com o mesmo conteúdo, sem tag e com o link inteiro', () => {
    const { text } = renderEmail(content)
    expect(text).not.toMatch(/<(p|strong|a|table|td|br)\b/)
    expect(text).toContain('Contrato <para> o seu aceite')
    expect(text).toContain('Olá, Ana & Cia.')
    expect(text).toContain('Prazo: 25/10/2026.')
    expect(text).toContain('Empresa: Distribuidora <Norte>')
    expect(text).toContain('Ler e aceitar:\nhttps://admin.addere.com.br/contrato/1?a=1&b=2')
  })

  it('sem quadro e sem botão, nada sobra deles', () => {
    const { html, text } = renderEmail({ ...content, details: undefined, action: undefined })
    expect(html).not.toContain('Se o botão não abrir')
    expect(text).not.toContain('Ler e aceitar')
  })
})

describe('escapeHtml e htmlToText', () => {
  it('ida e volta', () => {
    const raw = `<a href="x">'Tom' & "Jerry"</a>`
    expect(htmlToText(escapeHtml(raw))).toBe(raw)
  })

  it('htmlToText tira as tags e troca <br> por quebra de linha', () => {
    expect(htmlToText('um<br>dois <strong>três</strong>')).toBe('um\ndois três')
  })
})
