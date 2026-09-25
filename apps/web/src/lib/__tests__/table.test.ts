import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, applyTable, toggleSort, type SortConfig } from '../table'

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Item ${String(i).padStart(2, '0')}` }))
const all = () => true
const byName = (r: { name: string }) => r.name

describe('applyTable', () => {
  it('pagina de PAGE_SIZE em PAGE_SIZE', () => {
    const t = applyTable(rows(40), all, null, byName, 2)
    expect(t.total).toBe(40)
    expect(t.pages).toBe(Math.ceil(40 / PAGE_SIZE))
    expect(t.rows).toHaveLength(PAGE_SIZE)
    expect(t.rows[0].name).toBe(`Item ${String(PAGE_SIZE).padStart(2, '0')}`)
  })

  it('página além do fim volta para a última em vez de mostrar vazio', () => {
    // Acontece ao apagar registros com a paginação numa página alta
    const t = applyTable(rows(5), all, null, byName, 99)
    expect(t.rows).toHaveLength(5)
  })

  it('ordena respeitando acento e caixa do português', () => {
    const items = [{ name: 'Ávila' }, { name: 'ana' }, { name: 'Bruno' }]
    const asc = applyTable(items, all, { col: 'name', dir: 'asc' }, byName, 1)
    expect(asc.rows.map(byName)).toEqual(['ana', 'Ávila', 'Bruno'])
  })

  it('sem sort, preserva a ordem que veio da API', () => {
    const items = [{ name: 'Zeca' }, { name: 'Ana' }]
    expect(applyTable(items, all, null, byName, 1).rows.map(byName)).toEqual(['Zeca', 'Ana'])
  })

  it('o filtro entra antes da paginação', () => {
    const t = applyTable(rows(40), (r) => r.name.endsWith('1'), null, byName, 1)
    expect(t.total).toBe(4) // 01, 11, 21, 31
    expect(t.pages).toBe(1)
  })

  it('lista vazia devolve uma página, não zero', () => {
    const t = applyTable([], all, null, byName, 1)
    expect(t).toEqual({ rows: [], total: 0, pages: 1 })
  })
})

describe('toggleSort', () => {
  it('cicla asc → desc → sem ordenação', () => {
    let sort: SortConfig = null
    sort = toggleSort(sort, 'name')
    expect(sort).toEqual({ col: 'name', dir: 'asc' })
    sort = toggleSort(sort, 'name')
    expect(sort).toEqual({ col: 'name', dir: 'desc' })
    expect(toggleSort(sort, 'name')).toBeNull()
  })

  it('trocar de coluna recomeça em asc', () => {
    expect(toggleSort({ col: 'name', dir: 'desc' }, 'email')).toEqual({ col: 'email', dir: 'asc' })
  })
})
