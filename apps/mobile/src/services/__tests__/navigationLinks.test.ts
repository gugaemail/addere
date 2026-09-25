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
    expect(routeUrl(['A', 'B', 'C'])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=C&waypoints=A%7CB'
    )
    expect(routeUrl(['Só uma'])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=S%C3%B3%20uma'
    )
    expect(routeUrl([])).toBeNull()
    expect(routeUrl(['  '])).toBeNull()
  })

  it('WhatsApp normaliza o telefone BR e escapa o texto', () => {
    expect(whatsappUrl('(19) 99999-8888', 'Oi, tudo bem?')).toBe(
      'https://wa.me/5519999998888?text=Oi%2C%20tudo%20bem%3F'
    )
    expect(whatsappUrl('5519999998888', 'x')).toBe('https://wa.me/5519999998888?text=x')
    expect(whatsappUrl('', 'x')).toBeNull()
  })
})
