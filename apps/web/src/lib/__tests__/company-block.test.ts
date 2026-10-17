import { describe, it, expect, vi } from 'vitest'
import type { BillingOverdueStatus, ClientBlockState } from '@addere/types'

// lib/api.ts cria o axios client no import e lê env — isola só o reexport puro
vi.mock('../../config/env', () => ({ env: { apiUrl: 'http://localhost:3333' } }))

import { COMPANY_BLOCKED_EVENT, isCompanyBlockedError } from '../api'
import {
  billingBannerContent,
  blockedNavGroups,
  clientAccessCardContent,
  DEACTIVATE_COMPANY_WARNING,
  isAllowedWhileBlocked,
  isoDayLabel,
  todayYmdSaoPaulo,
  unblockDateRange,
  unblockUntilError,
} from '../company-block'

// Acesso suspenso da empresa (plano 017): o que o painel decide sem API.

describe('isCompanyBlockedError', () => {
  it('403 com o código COMPANY_BLOCKED → true', () => {
    expect(
      isCompanyBlockedError({ response: { status: 403, data: { code: 'COMPANY_BLOCKED' } } })
    ).toBe(true)
  })

  it('403 sem o código, 401 e erro sem resposta → false', () => {
    expect(isCompanyBlockedError({ response: { status: 403, data: { message: 'x' } } })).toBe(false)
    expect(
      isCompanyBlockedError({ response: { status: 401, data: { code: 'COMPANY_BLOCKED' } } })
    ).toBe(false)
    expect(isCompanyBlockedError(new Error('Network Error'))).toBe(false)
    expect(isCompanyBlockedError(null)).toBe(false)
    expect(isCompanyBlockedError(undefined)).toBe(false)
  })

  it('o evento tem nome próprio do Addere', () => {
    expect(COMPANY_BLOCKED_EVENT).toBe('addere:company-blocked')
  })
})

describe('isAllowedWhileBlocked', () => {
  it('ADMIN em /plano e em /contrato/abc/imprimir → true', () => {
    expect(isAllowedWhileBlocked('/plano', { isAdmin: true })).toBe(true)
    expect(isAllowedWhileBlocked('/contrato', { isAdmin: true })).toBe(true)
    expect(isAllowedWhileBlocked('/contrato/abc/imprimir', { isAdmin: true })).toBe(true)
  })

  it('ADMIN em /users ou num caminho que só começa parecido → false', () => {
    expect(isAllowedWhileBlocked('/users', { isAdmin: true })).toBe(false)
    expect(isAllowedWhileBlocked('/inteligencia', { isAdmin: true })).toBe(false)
    expect(isAllowedWhileBlocked('/planos', { isAdmin: true })).toBe(false)
  })

  it('gerente em /plano → false', () => {
    expect(isAllowedWhileBlocked('/plano', { isAdmin: false })).toBe(false)
  })
})

describe('blockedNavGroups', () => {
  const groups = [
    { title: 'Operação', items: [{ href: '/users' }] },
    { title: 'Inteligência', items: [{ href: '/inteligencia' }, { href: '/inteligencia/saude' }] },
    {
      title: 'Empresa',
      items: [
        { href: '/vendedores' },
        { href: '/configuracoes' },
        { href: '/contrato' },
        { href: '/plano' },
        { href: '/empresas' },
      ],
    },
  ]

  it('mantém só Contrato e Plano e cobrança, e some com os grupos vazios', () => {
    expect(blockedNavGroups(groups)).toEqual([
      { title: 'Empresa', items: [{ href: '/contrato' }, { href: '/plano' }] },
    ])
  })

  it('o menu do gerente (sem os itens do ADMIN) fica vazio', () => {
    expect(blockedNavGroups(groups.slice(0, 2))).toEqual([])
  })
})

describe('billingBannerContent', () => {
  const invoice = { id: 'inv-1', number: 12, competence: '2026-09', dueDate: '2026-10-10' }
  const status = (o: Partial<BillingOverdueStatus> = {}): BillingOverdueStatus => ({
    access: { blocked: false, reason: null },
    blockedAt: null,
    invoice,
    plannedBlockDate: null,
    ...o,
  })

  it('sem fatura vencida e liberada → null', () => {
    expect(billingBannerContent(status({ invoice: null }), '20261016')).toBeNull()
  })

  it('vencida, aviso ainda não enviado', () => {
    expect(billingBannerContent(status(), '20261011')).toEqual({
      tone: 'warning',
      text: 'Fatura nº 000012 (09/2026) vencida em 10/10/2026.',
    })
  })

  it('aviso enviado: a data prevista e em quantos dias', () => {
    expect(billingBannerContent(status({ plannedBlockDate: '2026-10-25' }), '20261016')).toEqual({
      tone: 'warning',
      text: 'Fatura nº 000012 (09/2026) vencida em 10/10/2026. Se não for paga, o acesso ao app e ao painel será suspenso em 25/10/2026 (em 9 dias).',
    })
    expect(
      billingBannerContent(status({ plannedBlockDate: '2026-10-25' }), '20261024')?.text
    ).toContain('(em 1 dia)')
  })

  it('data prevista já passou, sem bloqueio', () => {
    for (const today of ['20261025', '20261030']) {
      expect(billingBannerContent(status({ plannedBlockDate: '2026-10-25' }), today)).toEqual({
        tone: 'warning',
        text: 'Fatura nº 000012 (09/2026) vencida desde 10/10/2026. O acesso pode ser suspenso a qualquer momento.',
      })
    }
  })

  it('bloqueada por atraso: tom de perigo, desde quando (São Paulo) e que nada foi apagado', () => {
    expect(
      billingBannerContent(
        status({
          access: { blocked: true, reason: 'OVERDUE' },
          // 01:30 UTC do dia 26 ainda é dia 25 em São Paulo
          blockedAt: '2026-10-26T01:30:00.000Z',
          plannedBlockDate: '2026-10-25',
        }),
        '20261026'
      )
    ).toEqual({
      tone: 'danger',
      text: 'Acesso suspenso desde 25/10/2026: fatura nº 000012 vencida em 10/10/2026. Nenhum dado foi apagado. A baixa do pagamento libera o acesso na hora.',
    })
  })

  it('motivo MANUAL (reservado, gravado à mão)', () => {
    expect(
      billingBannerContent(status({ access: { blocked: true, reason: 'MANUAL' } }), '20261026')
    ).toEqual({ tone: 'danger', text: 'Acesso suspenso pela Addere. Fale com a Addere.' })
  })

  it('empresa desativada', () => {
    expect(
      billingBannerContent(
        status({ access: { blocked: true, reason: 'INACTIVE' }, invoice: null }),
        '20261026'
      )
    ).toEqual({ tone: 'danger', text: 'Empresa desativada. Fale com a Addere.' })
  })
})

describe('datas', () => {
  it('todayYmdSaoPaulo usa o dia civil de São Paulo, não o UTC', () => {
    expect(todayYmdSaoPaulo(new Date('2026-10-26T01:30:00Z'))).toBe('20261025')
    expect(todayYmdSaoPaulo(new Date('2026-10-26T12:00:00Z'))).toBe('20261026')
  })

  it("isoDayLabel: 'YYYY-MM-DD' → 'DD/MM/AAAA'", () => {
    expect(isoDayLabel('2026-01-04')).toBe('04/01/2026')
  })
})

describe('clientAccessCardContent (ficha do SUPERADMIN)', () => {
  const notice = {
    invoiceId: 'inv-1',
    invoiceNumber: 12,
    sentAt: '2026-10-11T12:00:00.000Z',
    plannedBlockDate: '2026-10-25',
  }
  const block = (o: Partial<ClientBlockState> = {}): ClientBlockState => ({
    companyActive: true,
    blockedAt: null,
    reason: null,
    exemptUntil: null,
    pendingNotice: null,
    ...o,
  })

  it('liberado e sem aviso: sem botão', () => {
    expect(clientAccessCardContent(block())).toEqual({
      tone: 'success',
      title: 'Acesso liberado',
      detail: null,
      canRelease: false,
    })
  })

  it('aviso enviado: data prevista e fatura, com "Liberar até…"', () => {
    expect(clientAccessCardContent(block({ pendingNotice: notice }))).toEqual({
      tone: 'warning',
      title: 'Aviso enviado em 11/10/2026 — suspensão prevista em 25/10/2026 (fatura nº 000012)',
      detail: null,
      canRelease: true,
    })
  })

  it('bloqueado por atraso: desde quando e o aviso que o sustenta', () => {
    expect(
      clientAccessCardContent(
        block({ blockedAt: '2026-10-25T12:00:00.000Z', reason: 'OVERDUE', pendingNotice: notice })
      )
    ).toEqual({
      tone: 'danger',
      title: 'Bloqueado por atraso desde 25/10/2026',
      detail:
        'Aviso de suspensão enviado em 11/10/2026 (fatura nº 000012), com data prevista 25/10/2026.',
      canRelease: true,
    })
  })

  it('liberado até uma data', () => {
    const c = clientAccessCardContent(block({ exemptUntil: '2026-11-05', pendingNotice: notice }))
    expect(c.title).toBe('Liberado até 05/11/2026')
    expect(c.canRelease).toBe(true)
  })

  it('MANUAL (reservado, gravado à mão): "fora do previsto"', () => {
    const c = clientAccessCardContent(
      block({ blockedAt: '2026-10-01T12:00:00.000Z', reason: 'MANUAL' })
    )
    expect(c.title).toBe('Bloqueado desde 01/10/2026, fora do previsto — use Liberar até…')
    expect(c.canRelease).toBe(true)
  })

  it('desativada tem precedência', () => {
    const c = clientAccessCardContent(
      block({ companyActive: false, blockedAt: '2026-10-25T12:00:00.000Z', reason: 'OVERDUE' })
    )
    expect(c.title).toBe(
      'Empresa desativada — o acesso está cortado (ficha técnica, Ativar empresa)'
    )
  })
})

describe('"Liberar até…"', () => {
  it('faixa de hoje a hoje + 90', () => {
    expect(unblockDateRange('20261017')).toEqual({ min: '2026-10-17', max: '2027-01-15' })
  })

  it('vazio vale (sem data); hoje e hoje + 90 valem', () => {
    expect(unblockUntilError('', '20261017')).toBeNull()
    expect(unblockUntilError('2026-10-17', '20261017')).toBeNull()
    expect(unblockUntilError('2027-01-15', '20261017')).toBeNull()
  })

  it('ontem ou depois de 90 dias: erro com a faixa', () => {
    const msg = 'Escolha uma data entre 17/10/2026 e 15/01/2027.'
    expect(unblockUntilError('2026-10-16', '20261017')).toBe(msg)
    expect(unblockUntilError('2027-01-16', '20261017')).toBe(msg)
    expect(unblockUntilError('17/10/2026', '20261017')).toBe('Data inválida')
  })
})

describe('"Desativar empresa"', () => {
  it('o aviso diz que corta o acesso e que atraso não passa por aqui', () => {
    expect(DEACTIVATE_COMPANY_WARNING).toContain('corta o acesso de todos os usuários')
    expect(DEACTIVATE_COMPANY_WARNING).toContain('Nenhum dado é apagado')
    expect(DEACTIVATE_COMPANY_WARNING).toContain('aviso de 10 dias')
  })
})
