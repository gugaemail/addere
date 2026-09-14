// KPIs da Equipe em campo (E8) sobre fixtures — nada aqui toca o banco.
import { describe, expect, it } from 'vitest'
import { buildTeamReport, type TeamInput } from '../team'
import { addDays, businessDaysIn, rangeWindow } from '../range'
import { resolveTeamScope } from '../manager.service'

const seller = (over: Partial<TeamInput['sellers'][number]> = {}) => ({
  userId: 'u1',
  name: 'Ana',
  vendorCode: 'V1',
  hasManager: true,
  portfolio: 10,
  positivatedInMonth: 4,
  ...over,
})

const base = (over: Partial<TeamInput> = {}): TeamInput => ({
  sellers: [seller()],
  plans: [{ vendorCode: 'V1', ymd: '20260825', activeItems: 8 }],
  visits: [],
  fromYmd: '20260825',
  toYmd: '20260825',
  minVisits: 0,
  stale: false,
  lastSyncAt: null,
  ...over,
})

const visit = (over: Partial<TeamInput['visits'][number]> = {}) => ({
  vendorCode: 'V1',
  ymd: '20260825',
  customerKey: 'C1|01',
  planItemId: 'i1',
  result: 'ORDER' as string | null,
  ...over,
})

describe('buildTeamReport', () => {
  it('aderência é visitas feitas sobre previstas', () => {
    const report = buildTeamReport(
      base({ visits: [visit(), visit({ customerKey: 'C2|01' }), visit({ customerKey: 'C3|01' })] })
    )
    expect(report.sellers[0].planned).toBe(8)
    expect(report.sellers[0].done).toBe(3)
    expect(report.sellers[0].adherencePct).toBe(37.5)
  })

  it('positivação da visita ignora visita ainda aberta', () => {
    const report = buildTeamReport(
      base({
        visits: [
          visit({ result: 'ORDER' }),
          visit({ customerKey: 'C2|01', result: 'NO_ORDER' }),
          visit({ customerKey: 'C3|01', result: null }),
        ],
      })
    )
    // 1 pedido em 2 visitas com desfecho — a terceira não conta como "sem pedido"
    expect(report.sellers[0].visitPositivationPct).toBe(50)
    expect(report.sellers[0].done).toBe(3)
  })

  it('positivação da carteira vem do mês, não da janela', () => {
    const report = buildTeamReport(
      base({ sellers: [seller({ portfolio: 8, positivatedInMonth: 2 })] })
    )
    expect(report.sellers[0].portfolioPositivationPct).toBe(25)
  })

  it('conta visita fora do plano separado', () => {
    const report = buildTeamReport(
      base({ visits: [visit(), visit({ customerKey: 'C9|01', planItemId: null })] })
    )
    expect(report.sellers[0].outOfPlan).toBe(1)
  })

  it('descarta plano e visita fora da janela', () => {
    const report = buildTeamReport(
      base({
        plans: [
          { vendorCode: 'V1', ymd: '20260825', activeItems: 8 },
          { vendorCode: 'V1', ymd: '20260826', activeItems: 5 },
        ],
        visits: [visit(), visit({ ymd: '20260826', customerKey: 'C2|01' })],
      })
    )
    expect(report.sellers[0].planned).toBe(8)
    expect(report.sellers[0].done).toBe(1)
  })

  it('sem plano, o alerta é só esse — não empilha com o de visitas', () => {
    const report = buildTeamReport(base({ plans: [], minVisits: 8, visits: [] }))
    expect(report.sellers[0].alerts.map((a) => a.kind)).toEqual(['NO_PLAN'])
  })

  it('plano gerado e nenhuma visita alerta mesmo sem capacidade definida', () => {
    // minVisits 0 é o caso de semana/mês: sobra só o inequívoco
    const report = buildTeamReport(base({ minVisits: 0, visits: [] }))
    expect(report.sellers[0].alerts).toEqual([
      { kind: 'FEW_VISITS', message: 'Plano gerado, nenhuma visita registrada' },
    ])
  })

  it('abaixo da capacidade do dia alerta com o número previsto', () => {
    const report = buildTeamReport(base({ minVisits: 8, visits: [visit()] }))
    expect(report.sellers[0].alerts).toEqual([
      { kind: 'FEW_VISITS', message: '1 de 8 visitas previstas para o dia' },
    ])
  })

  it('a mensagem conta contra o plano do vendedor, não contra a capacidade', () => {
    const report = buildTeamReport(
      base({
        plans: [{ vendorCode: 'V1', ymd: '20260825', activeItems: 10 }],
        minVisits: 8,
        visits: [visit()],
      })
    )
    expect(report.sellers[0].alerts).toEqual([
      { kind: 'FEW_VISITS', message: '1 de 10 visitas previstas para o dia' },
    ])
  })

  it('plano menor que a capacidade e todo visitado não alerta', () => {
    const visits = Array.from({ length: 5 }, (_, i) => visit({ customerKey: `C${i}|01` }))
    const report = buildTeamReport(
      base({
        plans: [{ vendorCode: 'V1', ymd: '20260825', activeItems: 5 }],
        minVisits: 8,
        visits,
      })
    )
    expect(report.sellers[0].alerts).toEqual([])
  })

  it('dentro da capacidade não alerta', () => {
    const visits = Array.from({ length: 8 }, (_, i) => visit({ customerKey: `C${i}|01` }))
    const report = buildTeamReport(base({ minVisits: 8, visits }))
    expect(report.sellers[0].alerts).toEqual([])
  })

  it('na semana e no mês, volume abaixo da capacidade não vira alerta', () => {
    // minVisits 0 = a aderência responde por volume; o alerta ficaria gritando
    // com todo vendedor que não fez 8 visitas por dia útil do mês
    const report = buildTeamReport(base({ minVisits: 0, visits: [visit()] }))
    expect(report.sellers[0].alerts).toEqual([])
  })

  it('dados velhos viram alerta do relatório, não do vendedor', () => {
    const report = buildTeamReport(base({ stale: true }))
    expect(report.alerts.map((a) => a.kind)).toEqual(['STALE_DATA'])
    expect(report.sellers[0].alerts.map((a) => a.kind)).not.toContain('STALE_DATA')
  })

  it('devolve o último sync para o cabeçalho mostrar o frescor', () => {
    const at = '2026-08-25T06:03:00.000Z'
    expect(buildTeamReport(base({ lastSyncAt: at })).lastSyncAt).toBe(at)
  })

  it('sem previstas, aderência é nula em vez de zero', () => {
    const report = buildTeamReport(base({ plans: [], visits: [visit()] }))
    expect(report.sellers[0].adherencePct).toBeNull()
  })

  it('totais somam os vendedores e contam os sem gerente', () => {
    const report = buildTeamReport(
      base({
        sellers: [
          seller(),
          seller({
            userId: 'u2',
            name: 'Bruno',
            vendorCode: 'V2',
            hasManager: false,
            portfolio: 10,
            positivatedInMonth: 6,
          }),
        ],
        plans: [
          { vendorCode: 'V1', ymd: '20260825', activeItems: 8 },
          { vendorCode: 'V2', ymd: '20260825', activeItems: 2 },
        ],
        visits: [visit(), visit({ vendorCode: 'V2', customerKey: 'C5|01', result: 'NO_ORDER' })],
      })
    )
    expect(report.totals).toMatchObject({ sellers: 2, planned: 10, done: 2, adherencePct: 20 })
    expect(report.totals.visitPositivationPct).toBe(50)
    expect(report.totals.portfolioPositivationPct).toBe(50) // (4+6)/(10+10)
    expect(report.unassignedSellers).toBe(1)
  })

  it('empresa sem vendedores devolve totais vazios sem quebrar', () => {
    const report = buildTeamReport(base({ sellers: [], plans: [], visits: [] }))
    expect(report.totals.sellers).toBe(0)
    expect(report.totals.adherencePct).toBeNull()
    expect(report.totals.portfolioPositivationPct).toBeNull()
  })
})

describe('rangeWindow', () => {
  it('day é o próprio dia', () => {
    expect(rangeWindow('20260825', 'day')).toEqual({ fromYmd: '20260825', toYmd: '20260825' })
  })

  it('week vai de segunda a domingo', () => {
    // 25/08/2026 é uma terça
    expect(rangeWindow('20260825', 'week')).toEqual({ fromYmd: '20260824', toYmd: '20260830' })
    // domingo pertence à semana que começou na segunda anterior
    expect(rangeWindow('20260830', 'week')).toEqual({ fromYmd: '20260824', toYmd: '20260830' })
  })

  it('month cobre o mês inteiro, respeitando o último dia', () => {
    expect(rangeWindow('20260825', 'month')).toEqual({ fromYmd: '20260801', toYmd: '20260831' })
    expect(rangeWindow('20260210', 'month').toYmd).toBe('20260228')
  })

  it('addDays atravessa a virada de mês', () => {
    expect(addDays('20260831', 1)).toBe('20260901')
    expect(addDays('20260301', -1)).toBe('20260228')
  })

  it('businessDaysIn exclui domingo e respeita o sábado', () => {
    const week = rangeWindow('20260825', 'week')
    expect(businessDaysIn(week, false)).toBe(5)
    expect(businessDaysIn(week, true)).toBe(6)
  })
})

describe('resolveTeamScope (D3b)', () => {
  it('admin vê a empresa inteira', () => {
    expect(resolveTeamScope({ viewerId: 'm1', isAdmin: true })).toEqual({ managerId: null })
  })

  it('gerente vê só os vendedores associados a ele — mesmo sendo o único da empresa', () => {
    expect(resolveTeamScope({ viewerId: 'm1', isAdmin: false })).toEqual({ managerId: 'm1' })
  })
})
