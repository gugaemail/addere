// Modelo do contrato (plano 014, @addere/types/contract-template): o
// renderizador é seguro e determinístico, a validação impede publicar o que o
// código não conhece, e os textos reais de docs/billing/ batem com a lista de
// campos. O último bloco quebra de propósito se alguém puser no texto um campo
// ou uma marcação que o código não conhece.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CONTRACT_FIELDS,
  SAMPLE_CONTRACT_VALUES,
  checkTemplateForPublish,
  fillContractTemplate,
  formatCnpj,
  formatCpf,
  isReviewNote,
  normalizeTemplateBody,
  removeReviewNotes,
  renderContractMarkdown,
} from '@addere/types'

describe('renderContractMarkdown', () => {
  it('escapa HTML antes de qualquer marcação', () => {
    const html = renderContractMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="a()">')
    expect(html).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n<p>&lt;img src=x onerror=&quot;a()&quot;&gt;</p>'
    )
    expect(renderContractMarkdown("R&D d'água")).toBe('<p>R&amp;D d&#39;água</p>')
  })

  it('títulos de um a três níveis; mais # vira h3', () => {
    expect(renderContractMarkdown('# A\n## B\n### C\n#### D')).toBe(
      '<h1>A</h1>\n<h2>B</h2>\n<h3>C</h3>\n<h3>D</h3>'
    )
  })

  it('listas, linha horizontal e negrito', () => {
    const md = [
      '- **Pacote:** Pacote 10',
      '* segundo item',
      '  continua o item',
      '',
      '3. terceiro',
      '4) quarto',
      '',
      '---',
      '',
      'texto com **negrito** e ** sem par',
    ].join('\n')
    expect(renderContractMarkdown(md)).toBe(
      [
        '<ul>',
        '<li><strong>Pacote:</strong> Pacote 10</li>',
        '<li>segundo item continua o item</li>',
        '</ul>',
        '<ol start="3">',
        '<li>terceiro</li>',
        '<li>quarto</li>',
        '</ol>',
        '<hr>',
        '<p>texto com <strong>negrito</strong> e ** sem par</p>',
      ].join('\n')
    )
  })

  it('linhas seguidas viram um parágrafo só', () => {
    expect(renderContractMarkdown('primeira linha\nsegunda linha\n\noutro')).toBe(
      '<p>primeira linha segunda linha</p>\n<p>outro</p>'
    )
  })

  it('CRLF e LF dão o mesmo HTML', () => {
    const lf = '# T\n\n- a\n- b\n\nparágrafo\ncontinua'
    expect(renderContractMarkdown(lf.replace(/\n/g, '\r\n'))).toBe(renderContractMarkdown(lf))
  })

  it('tabela, citação, link e itálico saem como texto', () => {
    expect(renderContractMarkdown('| a | b |\n|---|---|')).toBe('<p>| a | b | |---|---|</p>')
    expect(renderContractMarkdown('> citação')).toBe('<p>&gt; citação</p>')
    expect(renderContractMarkdown('[x](http://y) *i* _j_')).toBe('<p>[x](http://y) *i* _j_</p>')
  })

  it('não gera id, class nem atributo além do start', () => {
    const html = renderContractMarkdown('# A\n\n1. um\n\n- dois\n\n**b**')
    expect(html).not.toMatch(/\s(id|class|style|href|on\w+)=/)
  })
})

describe('checkTemplateForPublish', () => {
  it('corpo limpo pode publicar', () => {
    expect(checkTemplateForPublish('CONTRACT', '# T\n\n{{cliente.razaoSocial}}')).toEqual([])
  })

  it('corpo vazio', () => {
    expect(checkTemplateForPublish('CONTRACT', '  \r\n ')).toEqual([
      { type: 'EMPTY', text: '', line: 1 },
    ])
  })

  it('campo desconhecido, aditivo no contrato, marcas e chaves soltas, com a linha certa', () => {
    const body = [
      '# Título',
      'Telefone {{cliente.telefone}}',
      'Antes {{aditivo.pacoteAnterior}}',
      'Texto [[A DEFINIR]]',
      'Outro [[REVISAR: motivo]]',
      'Solto {{ e }} e {{cliente}}',
      'Marca [[ aberta',
    ].join('\r\n')
    expect(checkTemplateForPublish('CONTRACT', body)).toEqual([
      { type: 'UNKNOWN_FIELD', text: '{{cliente.telefone}}', line: 2 },
      { type: 'FIELD_NOT_ALLOWED_FOR_KIND', text: '{{aditivo.pacoteAnterior}}', line: 3 },
      { type: 'REVIEW_MARKER', text: '[[A DEFINIR]]', line: 4 },
      { type: 'REVIEW_MARKER', text: '[[REVISAR: motivo]]', line: 5 },
      { type: 'MALFORMED_PLACEHOLDER', text: 'Solto {{ e }} e {{cliente}}', line: 6 },
      { type: 'REVIEW_MARKER', text: 'Marca [[ aberta', line: 7 },
    ])
  })

  it('aditivo.* vale no modelo de aditivo', () => {
    expect(checkTemplateForPublish('AMENDMENT', 'Antes {{aditivo.pacoteAnterior}}')).toEqual([])
  })
})

describe('fillContractTemplate', () => {
  it('preenche todos os campos', () => {
    const body = CONTRACT_FIELDS.map((f) => `{{${f.key}}}`).join('\n')
    const { text, missing } = fillContractTemplate(body, SAMPLE_CONTRACT_VALUES)
    expect(missing).toEqual([])
    expect(text).not.toContain('{{')
    expect(text).toContain('Empresa Exemplo Ltda')
  })

  it('campo sem dado entra em missing uma vez só e o marcador fica', () => {
    const { text, missing } = fillContractTemplate(
      '{{cliente.cnpj}} e {{cliente.cnpj}} e {{cliente.telefone}} e {{cliente.razaoSocial}}',
      { 'cliente.cnpj': '   ', 'cliente.razaoSocial': 'Empresa' }
    )
    expect(missing).toEqual(['cliente.cnpj', 'cliente.telefone'])
    expect(text).toBe('{{cliente.cnpj}} e {{cliente.cnpj}} e {{cliente.telefone}} e Empresa')
  })

  it('dado de cadastro não vira marcação nem campo', () => {
    const { text, missing } = fillContractTemplate('Nome: {{cliente.razaoSocial}}', {
      'cliente.razaoSocial': '**Empresa** {{cliente.cnpj}} [[REVISAR]]\nLtda',
    })
    expect(missing).toEqual([])
    expect(text).toBe('Nome: Empresa cliente.cnpj REVISAR Ltda')
    expect(renderContractMarkdown(text)).toBe('<p>Nome: Empresa cliente.cnpj REVISAR Ltda</p>')
  })
})

describe('CONTRACT_FIELDS', () => {
  it('tem exatamente as chaves da lista fechada do plano 014', () => {
    expect(CONTRACT_FIELDS.map((f) => f.key).sort()).toEqual(
      [
        'contratada.razaoSocial',
        'contratada.cnpj',
        'contratada.endereco',
        'contratada.encarregado',
        'contratada.emailContato',
        'contratada.emailSuporte',
        'cliente.razaoSocial',
        'cliente.nomeFantasia',
        'cliente.cnpj',
        'cliente.endereco',
        'cliente.representanteNome',
        'cliente.representanteCpf',
        'cliente.representanteCargo',
        'cliente.emailCobranca',
        'cliente.administradorNome',
        'cliente.administradorEmail',
        'licenca.pacote',
        'licenca.tipo',
        'licenca.quantidade',
        'licenca.adicionais',
        'licenca.total',
        'licenca.inteligencia',
        'valores.pacote',
        'valores.pacoteExtenso',
        'valores.adicional',
        'valores.adicionalExtenso',
        'valores.mensal',
        'valores.mensalExtenso',
        'cobranca.carenciaMeses',
        'cobranca.diaVencimento',
        'cobranca.diasParaSuspensao',
        'documento.dataEmissao',
        'documento.versaoModelo',
        'aditivo.contratoAceitoEm',
        'aditivo.pacoteAnterior',
        'aditivo.tipoAnterior',
        'aditivo.quantidadeAnterior',
        'aditivo.adicionaisAnterior',
        'aditivo.valorPacoteAnterior',
        'aditivo.valorAdicionalAnterior',
        'aditivo.mensalAnterior',
        'aditivo.valeAPartirDe',
        'aditivo.motivo',
      ].sort()
    )
  })

  it('aditivo.* só no modelo de aditivo; o resto nos dois', () => {
    for (const field of CONTRACT_FIELDS) {
      const expected = field.key.startsWith('aditivo.') ? ['AMENDMENT'] : ['CONTRACT', 'AMENDMENT']
      expect([...field.kinds]).toEqual(expected)
    }
  })
})

describe('formatCnpj e formatCpf', () => {
  it('formata só com a quantidade certa de dígitos', () => {
    expect(formatCnpj('12345678000190')).toBe('12.345.678/0001-90')
    expect(formatCnpj(' 12.345.678/0001-90 ')).toBe('12.345.678/0001-90')
    expect(formatCnpj(' 123 ')).toBe('123')
    expect(formatCpf('11144477735')).toBe('111.444.777-35')
    expect(formatCpf('1114447773')).toBe('1114447773')
  })
})

// ─── Os textos reais ─────────────────────────────────────────────────────────

function docsPath(file: string): string {
  // npm test --workspace=apps/api roda em apps/api (../../docs/billing); sobe
  // diretórios para o teste também passar quando o Vitest roda de outro lugar
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, 'docs/billing', file)
    if (existsSync(candidate)) return candidate
    dir = resolve(dir, '..')
  }
  return resolve(process.cwd(), '../../docs/billing', file)
}

function publishableBody(file: string): string {
  const text = readFileSync(docsPath(file), 'utf8')
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((l) => l.includes('<!-- INÍCIO DO TEXTO PUBLICÁVEL -->'))
  const end = lines.findIndex((l) => l.includes('<!-- FIM DO TEXTO PUBLICÁVEL -->'))
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return lines.slice(start + 1, end).join('\n')
}

describe.each([
  ['contrato-licenca-de-uso-v1.md', 'CONTRACT'],
  ['aditivo-contratual-v1.md', 'AMENDMENT'],
] as const)('texto real %s', (file, kind) => {
  const body = publishableBody(file)

  it('nada impede publicar: sem nota [[REVISAR]] nem campo desconhecido (revisão de 19/10/2026)', () => {
    expect(checkTemplateForPublish(kind, body)).toEqual([])
  })

  it('os dados de exemplo preenchem todos os campos', () => {
    expect(fillContractTemplate(body, SAMPLE_CONTRACT_VALUES).missing).toEqual([])
  })

  it('o corpo não tem o envelope da minuta', () => {
    const normalized = normalizeTemplateBody(body)
    expect(normalized).not.toContain('TEXTO PUBLICÁVEL')
    expect(normalized).not.toContain('Histórico de versões')
    expect(normalized).not.toContain('MINUTA')
  })
})

describe('removeReviewNotes', () => {
  const body = [
    '# Contrato',
    '',
    '[[REVISAR: preâmbulo novo]]',
    '',
    'Primeira cláusula. [[REVISAR: cláusula nova]]',
    '',
    '[[REVISAR: começo]] Segunda cláusula com [[REVISAR: meio]] nota no meio.',
    '',
    'Terceira [[A DEFINIR]] e **negrito**. [[REVISAR: fim]]',
  ].join('\n')

  it('isReviewNote: só [[REVISAR…]]', () => {
    expect(isReviewNote('[[REVISAR: x]]')).toBe(true)
    expect(isReviewNote('[[REVISAR]]')).toBe(true)
    expect(isReviewNote('[[A DEFINIR]]')).toBe(false)
    expect(isReviewNote('texto [[REVISAR: x]]')).toBe(false)
  })

  it('todas: o texto fica, linha que era só nota sai sem deixar branco duplo, [[A DEFINIR]] fica', () => {
    expect(removeReviewNotes(body)).toBe(
      [
        '# Contrato',
        '',
        'Primeira cláusula.',
        '',
        'Segunda cláusula com nota no meio.',
        '',
        'Terceira [[A DEFINIR]] e **negrito**.',
      ].join('\n')
    )
  })

  it('uma: tira só a nota apontada (linha + texto), as outras ficam', () => {
    const issues = checkTemplateForPublish('CONTRACT', body).filter((i) => isReviewNote(i.text))
    const meio = issues.find((i) => i.text === '[[REVISAR: meio]]')!
    const out = removeReviewNotes(body, meio)
    expect(out).toContain('[[REVISAR: começo]] Segunda cláusula com nota no meio.')
    expect(checkTemplateForPublish('CONTRACT', out).filter((i) => isReviewNote(i.text))).toHaveLength(
      issues.length - 1
    )
  })

  it('alvo que não existe mais (já tirado) devolve o corpo como veio', () => {
    expect(removeReviewNotes(body, { line: 5, text: '[[REVISAR: outra]]' })).toBe(body)
    expect(removeReviewNotes('Sem nota nenhuma.')).toBe('Sem nota nenhuma.')
  })
})
