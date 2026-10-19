// 015 — pedido de licenças: só o indicado, preço mudou, aprovação sobe o limite, dupla aprovação
import { api, load, save, sql, sqlJson, check, j, lastEmailN, emailsSince } from './lib.mjs'
const s = load()
const T = s.saToken
const PW = 'E2e-Senha-123'
let seq = Number(s.vseq ?? 0)
const nextEmail = (p) => `${p}-${String(++seq).padStart(3, '0')}@exemplo.test`
const active = (cid) => Number(sql(`select count(*) from users where "companyId"='${cid}' and role='SALESPERSON' and active`))
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`

const set = await api('PUT', '/admin/billing/settings', { token: T, body: { overdueBlockDays: 15, dueReminderDays: 3, notifyEmail: 'addere-cobranca@exemplo.test' } })
console.log('settings', sc(set), j(set.body))

const jr = await api('POST', '/billing/me/license-requests', { token: s.joaoToken, body: { quantity: 2, unitPriceShown: '99.00' } })
check('015.pedido-joao-403', jr.status === 403 && jr.body.code === 'NOT_DESIGNATED_ADMIN', sc(jr))
const wrong = await api('POST', '/billing/me/license-requests', { token: s.mariaToken, body: { quantity: 2, unitPriceShown: '98.00' } })
check('015.pedido-preco-mudou-409', wrong.status === 409 && wrong.body.code === 'LICENSE_PRICE_CHANGED' && wrong.body.details?.unitPrice === '99.00', `${sc(wrong)} ${j(wrong.body.details)}`)
const n0 = lastEmailN()
const ok = await api('POST', '/billing/me/license-requests', { token: s.mariaToken, body: { quantity: 2, unitPriceShown: '99.0', message: 'Precisamos de 2' }, ip: '198.51.100.23', headers: { 'user-agent': 'E2E-UA' } })
const mails = emailsSince(n0)
check('015.pedido-ok-e-email', ok.status === 201 && mails.length === 1 && j(mails[0].body.to) === j(['addere-cobranca@exemplo.test']), `${sc(ok)} monthlyIncrease=${ok.body.monthlyIncrease} emails=${j(mails.map((m) => m.body.to))}`)
const lr = sqlJson(`select "requestedIp", "unitPriceShown"::text up, "declarationText" from billing_license_requests where id='${ok.body.id}'`)[0]
console.log('pedido gravado', j(lr))
const dup = await api('POST', '/billing/me/license-requests', { token: s.mariaToken, body: { quantity: 1, unitPriceShown: '99.00' } })
check('015.pedido-pendente-409', dup.status === 409 && dup.body.code === 'LICENSE_REQUEST_PENDING', sc(dup))

const before = active(s.companyA)
const pre = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Antes da aprovação', email: nextEmail('lic'), password: PW, role: 'SALESPERSON' } })
const ap = await api('POST', `/admin/billing/license-requests/${ok.body.id}/decide`, { token: T, body: { decision: 'APPROVE' } })
const n11 = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend 11 aprovado', email: nextEmail('lic'), password: PW, role: 'SALESPERSON' } })
const n12 = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend 12 aprovado', email: nextEmail('lic'), password: PW, role: 'SALESPERSON' } })
const n13 = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend 13 aprovado', email: nextEmail('lic'), password: PW, role: 'SALESPERSON' } })
const terms = sqlJson(`select version, t.status, origin, "extraSeats", "effectiveFrom" from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}' order by version`)
check('015.aprovacao-sobe-limite', before === 10 && pre.status === 409 && ap.status === 200 && ap.body.status === 'APPROVED' && n11.status === 201 && n12.status === 201 && n13.status === 409 && n13.body.details?.limit === 12,
  `antes=${before} criar antes=${sc(pre)} aprovar=${sc(ap)} 11º=${sc(n11)} 12º=${sc(n12)} 13º=${sc(n13)} ${j(n13.body.details)} termos=${j(terms.map((t) => `v${t.version}:${t.origin}:${t.extraSeats}`))}`)
const ap2 = await api('POST', `/admin/billing/license-requests/${ok.body.id}/decide`, { token: T, body: { decision: 'APPROVE' } })
check('015.segunda-aprovacao-409', ap2.status === 409 && ap2.body.code === 'LICENSE_REQUEST_ALREADY_DECIDED', sc(ap2))

// Duas aprovações simultâneas de um pedido novo
const r2 = await api('POST', '/billing/me/license-requests', { token: s.mariaToken, body: { quantity: 1, unitPriceShown: '99.00' } })
const tBefore = Number(sql(`select count(*) from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}'`))
const both = await Promise.all([0, 1, 2].map(() => api('POST', `/admin/billing/license-requests/${r2.body.id}/decide`, { token: T, body: { decision: 'APPROVE' } })))
const tAfter = Number(sql(`select count(*) from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}'`))
const extra = sql(`select "extraSeats" from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}' order by version desc limit 1`)
check('015.aprovacao-concorrente', r2.status === 201 && both.filter((r) => r.status === 200).length === 1 && tAfter === tBefore + 1 && extra === '3', `pedido=${sc(r2)} respostas=${j(both.map(sc))} termos ${tBefore}→${tAfter} extraSeats=${extra}`)
s.vseq = seq
save(s)
