// Aviso de suspensão sem destinatário: um evento por fatura, não um por tick.
// Empresa H sem contato de cobrança e sem ADMIN ativo (só no banco local),
// fatura avulsa vencida, dois jobs/run seguidos.
import fs from 'node:fs'
import path from 'node:path'
import { api, load, sql, sqlJson, check, j, DIR, DB } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const plus = (d) => sql(`select ((now() at time zone 'America/Sao_Paulo')::date + ${d})::text`)

sql(`update billing_client_profiles set "billingEmail"=null where "companyId"='${s.companyH}'`)
sql(`update users set active=false where "companyId"='${s.companyH}' and role='ADMIN'`)
const inv = await api('POST', '/admin/billing/invoices', { token: T, body: { companyId: s.companyH, competence: '2026-04', dueDate: plus(1), useContractTerms: false, items: [{ kind: 'ADJUSTMENT', description: 'Avulsa sem destinatário', amount: '50.00' }] } })
console.log('avulsa', sc(inv))
sql(`update billing_invoices set "dueDate"=((now() at time zone 'America/Sao_Paulo')::date - 5) where id='${inv.body.id}'`)

const r1 = await api('POST', '/admin/billing/jobs/run', { token: s.sa2Token })
const r2 = await api('POST', '/admin/billing/jobs/run', { token: s.sa3Token })
console.log('jobs/run', sc(r1), j(r1.body.suspensionNotices), sc(r2), j(r2.body.suspensionNotices))

const ev = sqlJson(`select payload->>'invoiceId' inv, "dedupeKey" k, payload from billing_events where "companyId"='${s.companyH}' and type='SUSPENSION_NOTICE_NO_RECIPIENT' order by "createdAt"`)
const notices = Number(sql(`select count(*) from billing_events where "companyId"='${s.companyH}' and type='SUSPENSION_NOTICE_SENT'`))
const perInvoice = {}
for (const e of ev) perInvoice[e.inv] = (perInvoice[e.inv] ?? 0) + 1
const ok = r1.status === 200 && r2.status === 200 && ev.length > 0 && Object.values(perInvoice).every((n) => n === 1) && perInvoice[inv.body.id] === 1 && notices === 0 && !JSON.stringify(ev).includes('@')
check('sentry.aviso-sem-destinatario-uma-vez', ok, `eventos=${ev.length} por fatura=${j(perInvoice)} avisos enviados=${notices} skipped=${r1.body.suspensionNotices?.skipped}/${r2.body.suspensionNotices?.skipped}`)
fs.appendFileSync(path.join(DIR, 'a4a5.jsonl'), j({ at: new Date().toISOString(), db: DB, norecipient: { perInvoice, notices } }) + '\n')
