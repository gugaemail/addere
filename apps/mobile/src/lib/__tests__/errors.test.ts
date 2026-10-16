import { getApiErrorMessage, NETWORK_ERROR_MESSAGE } from '../errors'

describe('getApiErrorMessage', () => {
  it('prefere a mensagem que o servidor mandou', () => {
    const err = Object.assign(new Error('Request failed with status code 422'), {
      isAxiosError: true,
      response: { data: { message: 'Cliente bloqueado no Protheus' } },
    })
    expect(getApiErrorMessage(err)).toBe('Cliente bloqueado no Protheus')
  })

  it('sem resposta do servidor, troca o "Network Error" do axios por uma frase legível', () => {
    const err = Object.assign(new Error('Network Error'), { isAxiosError: true })
    expect(getApiErrorMessage(err, 'Erro ao conectar com o servidor')).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('timeout também é falta de resposta', () => {
    const err = Object.assign(new Error('timeout of 8000ms exceeded'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    })
    expect(getApiErrorMessage(err)).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('erro que não é do axios segue com a própria mensagem ou o fallback', () => {
    expect(getApiErrorMessage(new Error('falhou'))).toBe('falhou')
    expect(getApiErrorMessage('x', 'Tente de novo')).toBe('Tente de novo')
  })
})
