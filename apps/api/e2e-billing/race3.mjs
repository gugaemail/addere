// Bateria de corridas e limites com banco real
import { api, login, load, save, sql, sqlJson, check, record, j, sha256 } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const plus = (d) => sql(`select ((now() at time zone 'America/Sao_Paulo')::date + ${d})::text`)
const today = plus(0)
const tally = (rs) => { const o = {}; for (const r of rs) o[sc(r)] = (o[sc(r)] ?? 0) + 1; return o }

async function mkCompany(name, cnpj) {
  const ex = sql(`select id from companies where cnpj='${cnpj}'`)
  if (ex) return ex
  const r = await api('POST', '/companies', { token: T, body: { name, cnpj, profile: { legalName: `${name} Ltda`, addressStreet: 'Rua A', addressNumber: '1', addressDistrict: 'Centro', addressCity: 'Campinas', addressState: 'SP', addressZip: '13010-000', legalRepName: 'Rep', legalRepCpf: '529.982.247-25', legalRepRole: 'Sócio', contactName: 'C', contactEmail: `c.${cnpj.slice(0, 2)}@exemplo.test`, billingEmail: `f.${cnpj.slice(0, 2)}@exemplo.test` } } })
  return r.body.id
}

// (m) dois rascunhos simultâneos numa empresa sem contrato
const K = await mkCompany('Corrida Rascunho', '71.000.000/0001-01')
const dr = { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '100.00', extraSeatPrice: '1.00', graceMonths: 0, dueDay: 10 }
const rs1 = await Promise.all([0, 1, 2].map(() => api('PUT', `/admin/billing/clients/${K}/contract`, { token: T, body: dr })))
const nC = sql(`select count(*) from billing_company_contracts where "companyId"='${K}'`)
check('extra.rascunho-concorrente', nC === '1' && rs1.every((r) => r.status === 200 || r.status === 409), `respostas=${j(tally(rs1))} contratos=${nC}`)

// (d) dois envios simultâneos
const admK = (await api('POST', '/users', { token: T, body: { name: 'Adm K', email: 'adm-k@exemplo.test', password: 'E2e-Senha-123', role: 'ADMIN', companyId: K } })).body.id
await api('PUT', `/admin/billing/clients/${K}/designated-admin`, { token: T, body: { userId: admK } })
const rs2 = await Promise.all([0, 1, 2].map(() => api('POST', `/admin/billing/clients/${K}/documents/send`, { token: T, body: {} })))
const nD = sql(`select count(*) from billing_contract_documents where "companyId"='${K}' and status='SENT'`)
check('extra.envio-concorrente', nD === '1' && rs2.filter((r) => r.status === 201).length === 1, `respostas=${j(tally(rs2))} documentos SENT=${nD}`)

// (k) duas versões de modelo ao mesmo tempo
const rs3 = await Promise.all([0, 1].map(() => api('POST', '/admin/billing/contract-templates', { token: T, body: { kind: 'AMENDMENT' } })))
check('extra.modelo-concorrente', rs3.filter((r) => r.status === 201).length === 1 && rs3.every((r) => r.status < 500), `respostas=${j(tally(rs3))}`)

// (e) dois pedidos de licença simultâneos (Maria, empresa A)
const rs4 = await Promise.all([0, 1, 2].map(() => api('POST', '/billing/me/license-requests', { token: s.mariaToken, body: { quantity: 1, unitPriceShown: '99.00' } })))
const nR = sql(`select count(*) from billing_license_requests where "companyId"='${s.companyA}' and status='PENDING'`)
check('extra.pedido-licenca-concorrente', nR === '1' && rs4.filter((r) => r.status === 201).length === 1, `respostas=${j(tally(rs4))} pendentes=${nR}`)
const pend = sql(`select id from billing_license_requests where "companyId"='${s.companyA}' and status='PENDING'`)
if (pend) await api('POST', `/admin/billing/license-requests/${pend}/decide`, { token: T, body: { decision: 'REJECT', reason: 'Teste de corrida' } })

// (h) duas avulsas na mesma competência ao mesmo tempo
const body = { companyId: s.companyD, competence: '2026-07', dueDate: plus(10), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Corrida avulsa', amount: '10.00' }] }
const rs5 = await Promise.all([0, 1, 2].map(() => api('POST', '/admin/billing/invoices', { token: T, body })))
const nI = sql(`select count(*) from billing_invoices where "companyId"='${s.companyD}' and competence='2026-07-01'`)
check('extra.avulsa-concorrente', nI === '1' && rs5.filter((r) => r.status === 201).length === 1 && rs5.every((r) => r.status === 201 || (r.status === 409 && r.body.code === 'INVOICE_ALREADY_EXISTS')), `respostas=${j(tally(rs5))} faturas=${nI}`)
const invD = sql(`select id from billing_invoices where "companyId"='${s.companyD}' and competence='2026-07-01'`)

// (g) cinco itens ao mesmo tempo
const rs6 = await Promise.all([1, 2, 3, 4, 5].map((n) => api('POST', `/admin/billing/invoices/${invD}/items`, { token: T, body: { kind: 'ADJUSTMENT', description: `Item ${n}`, amount: `${n}.01` } })))
const tot = sqlJson(`select total::text tt, (select sum(amount)::text from billing_invoice_items where "invoiceId"='${invD}') ss from billing_invoices where id='${invD}'`)[0]
check('extra.itens-concorrentes', rs6.every((r) => r.status === 201) && tot.tt === tot.ss && tot.tt === '25.05', `respostas=${j(tally(rs6))} total=${tot.tt} soma dos itens=${tot.ss}`)

// (f) baixa × cancelamento ao mesmo tempo
const rs7 = await Promise.all([
  api('POST', `/admin/billing/invoices/${invD}/pay`, { token: T, body: { paidAt: today, amount: '25.05', method: 'PIX' } }),
  api('POST', `/admin/billing/invoices/${invD}/cancel`, { token: s.sa2Token, body: { reason: 'Corrida' } }),
  api('POST', `/admin/billing/invoices/${invD}/items`, { token: s.sa3Token, body: { kind: 'ADJUSTMENT', description: 'Item tardio', amount: '1.00' } }),
])
const fin = sqlJson(`select status, total::text tt, (select sum(amount)::text from billing_invoice_items where "invoiceId"='${invD}') ss from billing_invoices where id='${invD}'`)[0]
check('extra.baixa-x-cancelamento', rs7.filter((r) => r.status === 200 || r.status === 201).length >= 1 && fin.tt === fin.ss && (fin.status === 'PAID' || fin.status === 'CANCELLED'), `respostas=${j(rs7.map(sc))} final=${j(fin)}`)

// (i) agendar cancelamento duas vezes ao mesmo tempo (empresa A? não: H)
const rs8 = await Promise.all([0, 1].map(() => api('POST', `/admin/billing/clients/${s.companyH}/contract/cancel`, { token: T, body: { reason: 'Corrida', deactivateCompany: false } })))
check('extra.cancelamento-concorrente', rs8.filter((r) => r.status === 200).length === 1 && rs8.every((r) => r.status < 500), `respostas=${j(tally(rs8))}`)
await api('POST', `/admin/billing/clients/${s.companyH}/contract/cancel/revert`, { token: T })

// (a) estouro do Decimal(14,2) no total
const big = { companyId: s.companyF, competence: '2026-06', dueDate: plus(10), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Valor gigante 1', amount: '999999999999.99' }, { kind: 'ADJUSTMENT', description: 'Valor gigante 2', amount: '999999999999.99' }] }
const ov = await api('POST', '/admin/billing/invoices', { token: T, body: big })
record('extra.decimal-overflow-total', ov.status === 500 ? 'FALHOU' : 'PASSOU', `avulsa com 2 itens de 999999999999.99: ${sc(ov)} ${j(ov.body).slice(0, 200)}`)
const ovd = await api('PUT', `/admin/billing/clients/${s.companyF}/contract`, { token: T, body: { ...dr, extraSeats: 10000, extraSeatPrice: '999999999999.99', packagePrice: '999999999999.99' } })
console.log('rascunho com valores máximos:', sc(ovd), ovd.body.terms?.[0]?.monthlyTotal)

// (b) e-mail duplicado ao mesmo tempo
const dupBody = { name: 'Dup', email: 'dup-race@exemplo.test', password: 'E2e-Senha-123', role: 'ADMIN', companyId: s.companyF }
const rs9 = await Promise.all([0, 1, 2].map(() => api('POST', '/users', { token: T, body: dupBody })))
const leak = rs9.find((r) => r.status !== 201 && /invocation|prisma|\.ts:/i.test(r.body?.message ?? ''))
record('extra.email-duplicado-concorrente', leak ? 'FALHOU' : 'PASSOU', `respostas=${j(tally(rs9))}${leak ? ' mensagem vazada: ' + leak.body.message.slice(0, 160).replace(/\n/g, ' ') : ''}`)
save(s)
