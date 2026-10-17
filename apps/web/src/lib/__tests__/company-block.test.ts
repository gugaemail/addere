import { describe, it, expect, vi } from 'vitest'
import type { BillingOverdueStatus } from '@addere/types'

// lib/api.ts cria o axios client no import e lê env — isola só o reexport puro
vi.mock('../../config/env', () => ({ env: { apiUrl: 'http://localhost:3333' } }))

import { COMPANY_BLOCKED_EVENT, isCompanyBlockedError } from '../api'
import {
  billingBannerContent,
  blockedNavGroups,
  isAllowedWhileBlocked,
  isoDayLabel,
  todayYmdSaoPaulo,
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
