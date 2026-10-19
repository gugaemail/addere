// 016 — primeira geração com dois jobs/run simultâneos (Resend falso respondendo 500)
import { api, login, load, save, sql, sqlJson, check, record, j, setMailFail, lastEmailN, emailsSince } from './lib.mjs'
const s = load()
s.sa2Token = (await login('superadmin2@exemplo.test')).accessToken
s.sa3Token = (await login('superadmin3@exemplo.test')).accessToken
save(s)

console.log('mode', await setMailFail(true))
const n0 = lastEmailN()
const [r1, r2] = await Promise.all([
  api('POST', '/admin/billing/jobs/run', { token: s.saToken }),
  api('POST', '/admin/billing/jobs/run', { token: s.sa2Token }),
])
console.log('run1', r1.status, j(r1.body))
console.log('run2', r2.status, j(r2.body))
await setMailFail(false)

const inv = sqlJson(`select co.name, i.number, i.competence::text comp, i."dueDate"::text due, i.status, i.origin, i.total::text total,
  (select json_agg(json_build_object('k',kind,'q',quantity,'u',"unitPrice"::text,'a',amount::text) order by kind) from billing_invoice_items it where it."invoiceId"=i.id) items
  from billing_invoices i join companies co on co.id=i."companyId" order by co.name, i.competence`)
console.log(j(inv))
const per = {}
for (const i of inv) per[`${i.name}|${i.comp}`] = (per[`${i.name}|${i.comp}`] ?? 0) + 1
const dup = Object.entries(per).filter(([, n]) => n > 1)
const created = (r1.body.invoices?.created ?? 0) + (r2.body.invoices?.created ?? 0)
const existing = (r1.body.invoices?.existing ?? 0) + (r2.body.invoices?.existing ?? 0)
check('016.jobs-run-concorrente-uma-fatura', r1.status === 200 && r2.status === 200 && dup.length === 0 && created === 5 && existing === 5,
  `created=${created} existing=${existing} duplicadas=${j(dup)} faturas=${inv.length}`)

const byName = Object.fromEntries(inv.map((i) => [i.name, i]))
const sum = (i) => i.items.reduce((a, x) => a + Math.round(Number(x.a) * 100), 0) / 100
const A = byName['Cliente Alfa'], B = byName['Cliente Beta']
check('016.fatura-competencia-passada', inv.every((i) => i.comp === '2026-09-01' && i.status === 'OPEN' && i.origin === 'JOB'), j(inv.map((i) => `${i.name}:${i.comp}:${i.due}`)))
check('016.itens-e-total', B && B.items.length === 2 && B.items.some((x) => x.k === 'EXTRA_SEATS' && x.q === 2 && x.u === '150.50' && x.a === '301.00') && B.total === '3501.00' && inv.every((i) => Number(i.total).toFixed(2) === sum(i).toFixed(2)),
  `B=${j(B?.items)} total=${B?.total}`)
check('016.termos-do-mes-nao-entram', A && A.items.length === 1 && A.items[0].k === 'PACKAGE' && A.total === '1800.00', `A (aditivo de 17/10 e pedidos de 18/10 fora): ${j(A?.items)} total=${A?.total}`)
check('016.draft-pending-sem-fatura', !byName['Cliente Delta'] && !byName['Cliente Epsilon'] && !byName['Cliente Zeta'], `faturas de: ${j(Object.keys(byName))}`)

const notices = sql(`select count(*) from billing_events where type='SUSPENSION_NOTICE_SENT'`)
const attempted = emailsSince(n0).filter((e) => e.failed)
check('017.aviso-nao-gravado-com-500', notices === '0' && attempted.length > 0 && r1.body.suspensionNotices.failed + r2.body.suspensionNotices.failed > 0,
  `eventos SUSPENSION_NOTICE_SENT=${notices}; tentativas recusadas no falso=${attempted.length}; summary1=${j(r1.body.suspensionNotices)} summary2=${j(r2.body.suspensionNotices)}`)
const nums = inv.map((i) => i.number).sort((a, b) => a - b)
console.log('números das faturas:', j(nums))
s.invA = sql(`select id from billing_invoices where "companyId"='${s.companyA}' and competence='2026-09-01'`)
s.invB = sql(`select id from billing_invoices where "companyId"='${s.companyB}' and competence='2026-09-01'`)
s.invC = sql(`select id from billing_invoices where "companyId"='${s.companyC}' and competence='2026-09-01'`)
s.invG = sql(`select id from billing_invoices where "companyId"='${s.companyG}' and competence='2026-09-01'`)
s.invH = sql(`select id from billing_invoices where "companyId"='${s.companyH}' and competence='2026-09-01'`)
save(s)
