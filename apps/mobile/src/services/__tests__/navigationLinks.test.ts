import {
  wazeUrl,
  appleMapsUrl,
  googleMapsUrl,
  routeUrl,
  stopChoices,
  routeChoices,
  whatsappUrl,
} from '../navigationLinks'

describe('navigationLinks (builders puros)', () => {
  it('Waze prioriza coordenadas e cai para endereço', () => {
    expect(wazeUrl({ lat: -22.9, lng: -47.06 })).toBe(
      'https://waze.com/ul?ll=-22.9,-47.06&navigate=yes'
    )
    expect(wazeUrl({ address: 'Rua A, Campinas' })).toBe(
      'https://waze.com/ul?q=Rua%20A%2C%20Campinas&navigate=yes'
    )
    expect(wazeUrl({})).toBeNull()
  })

  it('Apple e Google Maps priorizam coordenadas e caem para endereço', () => {
    expect(appleMapsUrl({ lat: -22.9, lng: -47.06 })).toBe(
      'https://maps.apple.com/?daddr=-22.9,-47.06'
    )
    expect(googleMapsUrl({ address: 'Rua A' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Rua%20A'
    )
    expect(googleMapsUrl({})).toBeNull()
  })

  it('menu da parada: Apple Maps só no iOS; Android cabe nos 3 botões do Alert', () => {
    const target = { lat: -23.6, lng: -46.66, address: 'Rua A, São Paulo - SP' }
    expect(stopChoices(target, 'ios').map((c) => c.label)).toEqual([
      'Abrir no Apple Maps',
      'Abrir no Google Maps',
      'Abrir no Waze',
      'Copiar endereço',
    ])
    const android = stopChoices(target, 'android')
    expect(android.map((c) => c.label)).toEqual([
      'Abrir no Google Maps',
      'Abrir no Waze',
      'Copiar endereço',
    ])
    expect(android[2]).toEqual({ label: 'Copiar endereço', copy: 'Rua A, São Paulo - SP' })
  })

  it('menu da parada: sem endereço não oferece copiar; sem nada, nenhuma opção', () => {
    expect(stopChoices({ lat: -23.6, lng: -46.66 }, 'ios').map((c) => c.label)).not.toContain(
      'Copiar endereço'
    )
    expect(stopChoices({}, 'ios')).toEqual([])
  })

  it('menu da rota: Google com todas as paradas; Waze e Apple Maps só a 1ª', () => {
    const stops = [
      { lat: -23.6, lng: -46.66, address: 'A' },
      { lat: -23.5, lng: -46.6, address: 'B' },
    ]
    const ios = routeChoices(stops, 'ios')
    expect(ios.map((c) => c.label)).toEqual([
      'Google Maps (todas as paradas)',
      'Apple Maps (1ª parada)',
      'Waze (1ª parada)',
    ])
    expect(ios[0]).toEqual({ label: ios[0].label, url: routeUrl(stops) })
    expect(ios[2]).toEqual({ label: 'Waze (1ª parada)', url: wazeUrl(stops[0]) })
    expect(routeChoices(stops, 'android').map((c) => c.label)).toEqual([
      'Google Maps (todas as paradas)',
      'Waze (1ª parada)',
    ])
    expect(routeChoices([], 'ios')).toEqual([])
  })

  it('rota completa põe a última parada como destino e as demais como waypoints', () => {
    expect(routeUrl([{ address: 'A' }, { address: 'B' }, { address: 'C' }])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=C&waypoints=A%7CB'
    )
    expect(routeUrl([{ address: 'Só uma' }])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=S%C3%B3%20uma'
    )
    expect(routeUrl([])).toBeNull()
    expect(routeUrl([{ address: '  ' }])).toBeNull()
  })

  it('rota completa usa a coordenada geocodificada quando há (o texto o Google às vezes não acha)', () => {
    expect(
      routeUrl([
        { lat: -23.6, lng: -46.66, address: 'RUA DR TANCREDO, SAO PAULO' },
        { lat: null, lng: null, address: 'Rua B, Campinas - SP' },
      ])
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Rua%20B%2C%20Campinas%20-%20SP&waypoints=-23.6%2C-46.66'
    )
  })

  it('rota completa leva no máximo 10 paradas (destino + 9 waypoints do Google)', () => {
    const stops = Array.from({ length: 12 }, (_, n) => ({ address: `P${n + 1}` }))
    const url = routeUrl(stops) as string
    expect(url).toContain('destination=P10&')
    expect(url).not.toContain('P11')
    expect(url.split('waypoints=')[1].split('%7C')).toHaveLength(9)
  })

  it('WhatsApp normaliza o telefone BR e escapa o texto', () => {
    expect(whatsappUrl('(19) 99999-8888', 'Oi, tudo bem?')).toBe(
      'https://wa.me/5519999998888?text=Oi%2C%20tudo%20bem%3F'
    )
    expect(whatsappUrl('5519999998888', 'x')).toBe('https://wa.me/5519999998888?text=x')
    expect(whatsappUrl('', 'x')).toBeNull()
  })
})
