// Carga na trava de licenças (40 simultâneas), indicado rebaixado no banco, leituras diversas
import { api, login, load, save, sql, sqlJson, check, record, j } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const tally = (rs) => { const o = {}; for (const r of rs) o[sc(r)] = (o[sc(r)] ?? 0) + 1; return o }
const active = (cid) => Number(sql(`select count(*) from users where "companyId"='${cid}' and role='SALESPERSON' and active`))

record('extra.itens-concorrentes', 'PASSOU', '5 itens simultâneos: total 26.05 = soma dos 7 itens no banco (erro de alias no meu SQL na 1ª conferência)')
record('extra.baixa-x-cancelamento', 'PASSOU', 'item 201, cancelamento 200, baixa 409 INVOICE_CANCELLED; status CANCELLED, total = soma dos itens')

// 40 criações simultâneas com A a 12 de 13
const before = active(s.companyA)
const PW = 'E2e-Senha-123'
let seq = Number(s.vseq ?? 0)
const reqs = Array.from({ length: 40 }, (_, i) => api('POST', i % 2 ? '/users' : `/companies/${s.companyA}/users`, { token: i % 3 ? s.mariaToken : T, body: { name: `Carga ${i}`, email: `carga-${++seq}@exemplo.test`, password: PW, role: 'SALESPERSON', ...(i % 2 && !(i % 3) ? { companyId: s.companyA } : {}) } }))
const t0 = Date.now()
const rs = await Promise.all(reqs)
const after = active(s.companyA)
const t = tally(rs)
check('extra.trava-40-simultaneas', before === 12 && after === 13 && rs.filter((r) => r.status === 201).length === 1 && !rs.some((r) => r.status >= 500), `antes=${before} depois=${after} respostas=${j(t)} em ${Date.now() - t0} ms`)
s.vseq = seq

// Indicado rebaixado no banco, com o JWT ainda dizendo ADMIN
const kId = sql(`select id from companies where cnpj='71.000.000/0001-01'`)
const kDoc = sql(`select id from billing_contract_documents where "companyId"='${kId}' and status='SENT'`)
const kTok = (await login('adm-k@exemplo.test')).accessToken
const view = await api('GET', `/billing/me/documents/${kDoc}`, { token: kTok })
sql(`update users set role='SALESPERSON' where email='adm-k@exemplo.test'`)
const { createHash } = await import('node:crypto')
const acc = await api('POST', `/billing/me/documents/${kDoc}/accept`, { token: kTok, body: { sha256: createHash('sha256').update(view.body.renderedBody, 'utf8').digest('hex') } })
check('extra.indicado-rebaixado-403', acc.status === 403 && acc.body.code === 'NOT_DESIGNATED_ADMIN', sc(acc))
sql(`update users set role='ADMIN' where email='adm-k@exemplo.test'`)

// Leituras: contrato cancelado, histórico, ficha
const gil = (await login('gil@exemplo.test')).accessToken
const gm = await api('GET', '/billing/me', { token: gil })
const gs = await api('GET', '/billing/me/seats', { token: gil })
console.log('G /billing/me', sc(gm), j(gm.body.contract), 'seats', sc(gs), j(gs.body))
const ev = await api('GET', `/admin/billing/clients/${s.companyA}/events`, { token: T })
const fA = await api('GET', `/admin/billing/clients/${s.companyA}`, { token: T })
const docs = await api('GET', `/admin/billing/clients/${s.companyA}/documents`, { token: T })
const lr = await api('GET', '/admin/billing/license-requests', { token: T })
const inv = await api('GET', `/admin/billing/invoices?companyId=${s.companyA}`, { token: T })
const seatsSa = await api('GET', `/billing/me/seats?companyId=${s.companyA}`, { token: T })
check('extra.leituras-200', [gm, gs, ev, fA, docs, lr, inv, seatsSa].every((r) => r.status === 200), `G /billing/me=${sc(gm)} seats=${sc(gs)} eventos A=${sc(ev)} (${ev.body.length ?? ev.body.items?.length}) ficha=${sc(fA)} docs=${sc(docs)} pedidos=${sc(lr)} faturas=${sc(inv)} seats SA=${sc(seatsSa)} ${j({ used: seatsSa.body.used, limit: seatsSa.body.limit })}`)
const evTxt = JSON.stringify(ev.body)
check('extra.historico-sem-dado-pessoal', !/@|203\.0\.113|52998224725/.test(evTxt), `eventos da ficha: ${evTxt.length} bytes, sem e-mail/IP/CPF`)
save(s)
