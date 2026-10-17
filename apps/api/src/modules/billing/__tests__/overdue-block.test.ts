// A regra do aviso de suspensão e do bloqueio (plano 017, passo 3). O centro
// é a promessa do contrato: nunca bloqueia sem aviso entregue e gravado há
// pelo menos 10 dias corridos, nem com overdueBlockDays menor que 10.
import { describe, it, expect } from 'vitest'
import {
  MAX_EXEMPTION_DAYS,
  MIN_NOTICE_DAYS,
  REMINDER_DAYS_BEFORE,
  computePlannedBlockDate,
  noticeDue,
  overdueBlockHolds,
  reminderDue,
} from '../overdue-block'
import { addDaysYmd } from '../../intelligence/engine/business-days'

describe('constantes do contrato', () => {
  it('piso de 10 dias, lembrete de 3 e liberação de até 90', () => {
    expect(MIN_NOTICE_DAYS).toBe(10)
    expect(REMINDER_DAYS_BEFORE).toBe(3)
    expect(MAX_EXEMPTION_DAYS).toBe(90)
  })
})

describe('computePlannedBlockDate', () => {
  it('vence 10/10, 15 dias, aviso em 11/10 → 25/10', () => {
    expect(
      computePlannedBlockDate({ dueYmd: '20261010', overdueBlockDays: 15, sentYmd: '20261011' })
    ).toBe('20261025')
  })

  it('vence 10/10, 3 dias, aviso em 11/10 → 21/10 (o piso de 10 dias vence)', () => {
    expect(
      computePlannedBlockDate({ dueYmd: '20261010', overdueBlockDays: 3, sentYmd: '20261011' })
    ).toBe('20261021')
  })

  it('aviso atrasado em 20/10 com 15 dias → 30/10', () => {
    expect(
      computePlannedBlockDate({ dueYmd: '20261010', overdueBlockDays: 15, sentYmd: '20261020' })
    ).toBe('20261030')
  })

  it('aviso em 25/12 com 3 dias → 04/01 do ano seguinte', () => {
    expect(
      computePlannedBlockDate({ dueYmd: '20261224', overdueBlockDays: 3, sentYmd: '20261225' })
    ).toBe('20270104')
  })
})

describe('noticeDue', () => {
  const base = { status: 'OPEN', dueYmd: '20261010', hasNotice: false }

  it('vence hoje → false', () => {
    expect(noticeDue({ ...base, todayYmd: '20261010' })).toBe(false)
  })

  it('venceu ontem → true', () => {
    expect(noticeDue({ ...base, todayYmd: '20261011' })).toBe(true)
  })

  it('já avisada → false', () => {
    expect(noticeDue({ ...base, todayYmd: '20261011', hasNotice: true })).toBe(false)
  })

  it('PAID → false', () => {
    expect(noticeDue({ ...base, todayYmd: '20261011', status: 'PAID' })).toBe(false)
  })

  it('CANCELLED → false', () => {
    expect(noticeDue({ ...base, todayYmd: '20261020', status: 'CANCELLED' })).toBe(false)
  })
})

describe('reminderDue', () => {
  const base = {
    status: 'OPEN',
    plannedBlockYmd: '20261025',
    hasReminder: false,
    exemptUntilYmd: null,
  }

  it('3 dias antes → true', () => {
    expect(reminderDue({ ...base, todayYmd: '20261022' })).toBe(true)
  })

  it('1 dia antes → true', () => {
    expect(reminderDue({ ...base, todayYmd: '20261024' })).toBe(true)
  })

  it('4 dias antes → false', () => {
    expect(reminderDue({ ...base, todayYmd: '20261021' })).toBe(false)
  })

  it('no próprio dia → false', () => {
    expect(reminderDue({ ...base, todayYmd: '20261025' })).toBe(false)
  })

  it('já enviado → false', () => {
    expect(reminderDue({ ...base, todayYmd: '20261022', hasReminder: true })).toBe(false)
  })

  it('liberação até depois da data → false; até antes da data → true', () => {
    expect(reminderDue({ ...base, todayYmd: '20261022', exemptUntilYmd: '20261030' })).toBe(false)
    expect(reminderDue({ ...base, todayYmd: '20261022', exemptUntilYmd: '20261025' })).toBe(false)
    expect(reminderDue({ ...base, todayYmd: '20261022', exemptUntilYmd: '20261024' })).toBe(true)
  })

  it('fatura paga → false', () => {
    expect(reminderDue({ ...base, todayYmd: '20261022', status: 'PAID' })).toBe(false)
  })
})

describe('overdueBlockHolds', () => {
  const TODAY = '20261025'
  const notice = (sentDaysAgo: number, plannedBlockYmd: string) => ({
    sentYmd: addDaysYmd(TODAY, -sentDaysAgo),
    plannedBlockYmd,
  })
  const holds = (
    invoices: Array<{
      status: string
      notice: { sentYmd: string; plannedBlockYmd: string } | null
    }>,
    over: Partial<{ autoBlockEnabled: boolean; exemptUntilYmd: string | null }> = {}
  ) =>
    overdueBlockHolds({
      autoBlockEnabled: true,
      exemptUntilYmd: null,
      todayYmd: TODAY,
      invoices,
      ...over,
    })

  it('sem aviso, 60 dias de atraso e overdueBlockDays = 3 → false', () => {
    // Vencida há 60 dias: vencimento + 3 já passou há muito, mas não há aviso
    const due = addDaysYmd(TODAY, -60)
    expect(
      computePlannedBlockDate({ dueYmd: due, overdueBlockDays: 3, sentYmd: due }) < TODAY
    ).toBe(true)
    expect(holds([{ status: 'OPEN', notice: null }])).toBe(false)
  })

  it('aviso há 9 dias, mesmo com a data prevista forçada para hoje → false', () => {
    expect(holds([{ status: 'OPEN', notice: notice(9, TODAY) }])).toBe(false)
  })

  it('aviso há 10 dias e data alcançada → true', () => {
    expect(holds([{ status: 'OPEN', notice: notice(10, TODAY) }])).toBe(true)
  })

  it('aviso há 12 dias e data no futuro → false', () => {
    expect(holds([{ status: 'OPEN', notice: notice(12, '20261026') }])).toBe(false)
  })

  it('liberação até hoje → false; até ontem → true', () => {
    const invoices = [{ status: 'OPEN', notice: notice(10, TODAY) }]
    expect(holds(invoices, { exemptUntilYmd: TODAY })).toBe(false)
    expect(holds(invoices, { exemptUntilYmd: '20261024' })).toBe(true)
  })

  it('autoBlockEnabled = false → false', () => {
    expect(
      holds([{ status: 'OPEN', notice: notice(30, '20261001') }], { autoBlockEnabled: false })
    ).toBe(false)
  })

  it('fatura PAID ou CANCELLED com aviso antigo → false', () => {
    expect(holds([{ status: 'PAID', notice: notice(30, '20261001') }])).toBe(false)
    expect(holds([{ status: 'CANCELLED', notice: notice(30, '20261001') }])).toBe(false)
  })

  it('duas faturas, só uma qualifica → true', () => {
    expect(
      holds([
        { status: 'OPEN', notice: notice(5, '20261030') },
        { status: 'OPEN', notice: notice(14, '20261020') },
      ])
    ).toBe(true)
  })

  it('nenhuma combinação sem aviso bloqueia, em 120 dias de atraso', () => {
    for (let days = 0; days <= 120; days++) {
      const today = addDaysYmd('20261010', days)
      expect(
        overdueBlockHolds({
          autoBlockEnabled: true,
          exemptUntilYmd: null,
          todayYmd: today,
          invoices: [{ status: 'OPEN', notice: null }],
        })
      ).toBe(false)
    }
  })

  it('com overdueBlockDays = 3, o bloqueio só sai no dia envio + 10', () => {
    const due = '20261010'
    const sent = '20261011'
    const planned = computePlannedBlockDate({ dueYmd: due, overdueBlockDays: 3, sentYmd: sent })
    for (let offset = 0; offset < MIN_NOTICE_DAYS; offset++) {
      const today = addDaysYmd(sent, offset)
      expect(
        overdueBlockHolds({
          autoBlockEnabled: true,
          exemptUntilYmd: null,
          todayYmd: today,
          invoices: [{ status: 'OPEN', notice: { sentYmd: sent, plannedBlockYmd: planned } }],
        }),
        today
      ).toBe(false)
    }
    expect(
      overdueBlockHolds({
        autoBlockEnabled: true,
        exemptUntilYmd: null,
        todayYmd: addDaysYmd(sent, MIN_NOTICE_DAYS),
        invoices: [{ status: 'OPEN', notice: { sentYmd: sent, plannedBlockYmd: planned } }],
      })
    ).toBe(true)
  })
})
