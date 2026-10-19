// A4 — estouro do Decimal(14,2): antes 500 (ou gravado e impossível de faturar), depois 422
import fs from 'node:fs'
import path from 'node:path'
import { api, load, sql, sqlJson, j, DIR, DB } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const plus = (d) => sql(`select ((now() at time zone 'America/Sao_Paulo')::date + ${d})::text`)
const MAX = '999999999999.99'
const out = {}

async function company(name, cnpj) {
  const ex = sql(`select id from companies where cnpj='${cnpj}'`)
  if (ex) return ex
  const r = await api('POST', '/companies', { token: T, body: { name, cnpj, profile: { legalName: `${name} Ltda`, billingEmail: `fin.${cnpj.slice(0, 2)}@exemplo.test` } } })
  if (r.status !== 201) throw new Error(`company ${r.status} ${j(r.body)}`)
  return r.body.id
}
const X = await company('Estouro', '61.000.000/0001-61')

// 1. Avulsa com dois itens do máximo: a soma passa do Decimal(14,2)
const r1 = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: X, competence: '2026-06', dueDate: plus(10), useContractTerms: false, items: [
  { kind: 'ADJUSTMENT', description: 'Valor gigante 1', amount: MAX }, { kind: 'ADJUSTMENT', description: 'Valor gigante 2', amount: MAX }] } })
out.avulsa_2x_max = `${sc(r1)} ${(r1.body.message ?? '').slice(0, 90)}`

// 2. Avulsa no limite (cabe) e um item a mais que estoura
const r2 = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: X, competence: '2026-05', dueDate: plus(10), useContractTerms: false, items: [
  { kind: 'ADJUSTMENT', description: 'No limite', amount: MAX }] } })
out.avulsa_1x_max = sc(r2)
if (r2.status === 201) {
  const r3 = await api('POST', `/admin/billing/invoices/${r2.body.id}/items`, { token: T, body: { kind: 'ADJUSTMENT', description: 'Um real a mais', amount: '1.00' } })
  out.item_que_estoura = `${sc(r3)} ${(r3.body.message ?? '').slice(0, 90)}`
  const tot = sqlJson(`select total::text tt, (select count(*) from billing_invoice_items where "invoiceId"='${r2.body.id}') nn from billing_invoices where id='${r2.body.id}'`)[0]
  out.fatura_no_limite_depois = tot
}

// 3. Rascunho com o total mensal acima do máximo (pacote + 10000 × adicional)
const r4 = await api('PUT', `/admin/billing/clients/${X}/contract`, { token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 10000, packagePrice: MAX, extraSeatPrice: MAX, graceMonths: 0, dueDay: 10 } })
out.rascunho_total_acima = `${sc(r4)} monthlyTotal=${r4.body.terms?.[0]?.monthlyTotal ?? '-'}`

// 4. Rascunho no limite exato: cabe e salva
const r5 = await api('PUT', `/admin/billing/clients/${X}/contract`, { token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 1, packagePrice: '999999999998.99', extraSeatPrice: '1.00', graceMonths: 0, dueDay: 10 } })
out.rascunho_no_limite = `${sc(r5)} monthlyTotal=${r5.body.terms?.[0]?.monthlyTotal ?? '-'}`

// 5. Aditivo com o total acima (empresa C, ativa), a pedido da Empresa para não exigir data
const r6 = await api('PUT', `/admin/billing/clients/${s.companyC}/amendment`, { token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 10000, packagePrice: '1500.00', extraSeatPrice: MAX, reason: 'Estouro', requestedByClient: true } })
out.aditivo_total_acima = sc(r6)
if (r6.status === 200) await api('POST', `/admin/billing/clients/${s.companyC}/amendment/withdraw`, { token: T })

console.log('A4', j(out))
fs.appendFileSync(path.join(DIR, 'a4a5.jsonl'), j({ at: new Date().toISOString(), db: DB, a4: out }) + '\n')
