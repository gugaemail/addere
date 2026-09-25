import { maskTime, sortWindows, validateWindow, windowLabel } from '../customerWindows'

describe('maskTime', () => {
  it('insere os dois pontos e limita a 4 dígitos', () => {
    expect(maskTime('0')).toBe('0')
    expect(maskTime('08')).toBe('08')
    expect(maskTime('080')).toBe('08:0')
    expect(maskTime('0800')).toBe('08:00')
    expect(maskTime('08:00')).toBe('08:00')
    expect(maskTime('08:001')).toBe('08:00')
    expect(maskTime('a8h0')).toBe('80')
  })
})

describe('validateWindow', () => {
  it('aceita HH:MM com fim depois do início', () => {
    expect(validateWindow({ startTime: '08:00', endTime: '12:00' })).toEqual({ ok: true })
    expect(validateWindow({ startTime: ' 08:00 ', endTime: '08:30' })).toEqual({ ok: true })
  })

  it('rejeita formato fora de HH:MM', () => {
    expect(validateWindow({ startTime: '8:00', endTime: '12:00' }).ok).toBe(false)
    expect(validateWindow({ startTime: '08:00', endTime: '12h' }).ok).toBe(false)
    expect(validateWindow({ startTime: '', endTime: '' }).ok).toBe(false)
  })

  it('rejeita hora ou minuto fora da faixa', () => {
    expect(validateWindow({ startTime: '25:00', endTime: '26:00' }).ok).toBe(false)
    expect(validateWindow({ startTime: '08:60', endTime: '09:00' }).ok).toBe(false)
  })

  it('rejeita fim igual ou antes do início, com mensagem', () => {
    const same = validateWindow({ startTime: '08:00', endTime: '08:00' })
    expect(same).toEqual({ ok: false, error: 'O fim precisa ser depois do início.' })
    expect(validateWindow({ startTime: '14:00', endTime: '09:00' }).ok).toBe(false)
  })
})

describe('windowLabel / sortWindows', () => {
  it('rotula com o dia abreviado', () => {
    expect(windowLabel({ weekday: 1, startTime: '08:00', endTime: '12:00' })).toBe('Seg 08:00–12:00')
    expect(windowLabel({ weekday: 6, startTime: '09:00', endTime: '11:00' })).toBe('Sáb 09:00–11:00')
  })

  it('ordena por dia e depois por início, sem mutar a entrada', () => {
    const input = [
      { weekday: 3, startTime: '14:00' },
      { weekday: 1, startTime: '13:00' },
      { weekday: 1, startTime: '08:00' },
    ]
    expect(sortWindows(input).map((w) => `${w.weekday}${w.startTime}`)).toEqual([
      '108:00',
      '113:00',
      '314:00',
    ])
    expect(input[0].weekday).toBe(3)
  })
})
