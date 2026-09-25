import { mappableItems, regionForItems, unmappedCount } from '../mapRegion'
import type { VisitPlanItemDto } from '@addere/types'

const item = (id: string, lat: number | null, lng: number | null, removedAt: string | null = null) =>
  ({ id, lat, lng, removedAt }) as VisitPlanItemDto

describe('mapRegion', () => {
  const items = [
    item('a', -22.9, -47.06),
    item('b', -22.95, -47.1),
    item('c', null, null), // sem geocodificação → fora do mapa
    item('d', -22.8, -47.0, '2026-08-23'), // removida do dia
  ]

  it('mappableItems: só ativas com coordenada', () => {
    expect(mappableItems(items).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('unmappedCount: ativas sem coordenada', () => {
    expect(unmappedCount(items)).toBe(1)
  })

  it('regionForItems enquadra os pinos com folga', () => {
    const region = regionForItems(items)
    expect(region?.latitude).toBeCloseTo(-22.925)
    expect(region?.longitude).toBeCloseTo(-47.08)
    expect(region?.latitudeDelta).toBeCloseTo(0.05 * 1.4)
    expect(region?.longitudeDelta).toBeCloseTo(0.04 * 1.4, 5)
  })

  it('um pino só usa o zoom mínimo; sem pinos retorna null', () => {
    const single = regionForItems([item('a', -22.9, -47.06)])
    expect(single?.latitudeDelta).toBe(0.01)
    expect(regionForItems([item('x', null, null)])).toBeNull()
  })
})
