import { wazeUrl, mapsUrl, routeUrl, whatsappUrl } from '../navigationLinks'

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

  it('Maps usa Apple no iOS e Google nos demais', () => {
    expect(mapsUrl({ lat: -22.9, lng: -47.06 }, 'ios')).toBe(
      'https://maps.apple.com/?daddr=-22.9,-47.06'
    )
    expect(mapsUrl({ address: 'Rua A' }, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Rua%20A'
    )
    expect(mapsUrl({}, 'android')).toBeNull()
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
