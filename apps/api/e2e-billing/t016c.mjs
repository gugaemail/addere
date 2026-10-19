// 016 — cancelamento do contrato (agendar, desfazer, encerrar), lembretes uma vez só; 017 — aviso
import { api, load, save, sql, sqlJson, check, j, lastEmailN, emailsSince } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`

// ─── Cancelamento: agendar, desfazer, agendar de novo ───────────────────────
const c1 = await api('POST', `/admin/billing/clients/${s.companyG}/contract/cancel`, { token: T, body: { reason: 'Cliente pediu', deactivateCompany: true } })
const c1b = await api('POST', `/admin/billing/clients/${s.companyG}/contract/cancel`, { token: T, body: { reason: 'De novo', deactivateCompany: true } })
const rv = await api('POST', `/admin/billing/clients/${s.companyG}/contract/cancel/revert`, { token: T })
const afterRv = sqlJson(`select status, "endsAt", "cancelReason", "deactivateCompanyOnEnd" from billing_company_contracts where "companyId"='${s.companyG}'`)[0]
const rv2 = await api('POST', `/admin/billing/clients/${s.companyG}/contract/cancel/revert`, { token: T })
check('016.cancelamento-agendar-desfazer', c1.status === 200 && c1.body.endsAt === '2026-10-31' && c1b.status === 409 && c1b.body.code === 'CONTRACT_CANCEL_ALREADY_SCHEDULED' && rv.status === 200 && afterRv.endsAt === null && afterRv.status === 'ACTIVE' && rv2.status === 409,
  `agendar=${sc(c1)} endsAt=${c1.body.endsAt} agendar de novo=${sc(c1b)} desfazer=${sc(rv)} depois=${j(afterRv)} desfazer 2x=${sc(rv2)}`)
const c2 = await api('POST', `/admin/billing/clients/${s.companyG}/contract/cancel`, { token: T, body: { reason: 'Cliente pediu de vez', deactivateCompany: true } })
console.log('agendar de novo', sc(c2), c2.body.endsAt)
// Viagem: o cancelamento foi pedido em setembro e terminou em 30/09
sql(`update billing_company_contracts set "endsAt"='2026-09-30', "cancelRequestedAt"='2026-09-20 15:00:00' where "companyId"='${s.companyG}'`)
const gBefore = sqlJson(`select active, "intelligenceEnabled" from companies where id='${s.companyG}'`)[0]

// ─── Preparação dos lembretes e do aviso ─────────────────────────────────────
// H sem destinatário: o aviso nunca é gravado (fatura vencida há 60 dias sem aviso)
const offH = await api('PATCH', `/users/${s.heloId}/active`, { token: T })
sql(`update billing_client_profiles set "billingEmail"=null where "companyId"='${s.companyH}'`)
sql(`update billing_invoices set "dueDate"=((now() at time zone 'America/Sao_Paulo')::date - 60) where id='${s.invH}'`)
// C vencida ontem
sql(`update billing_invoices set "dueDate"=((now() at time zone 'America/Sao_Paulo')::date - 1) where id='${s.invC}'`)
// Documento de E enviado há 4 dias
sql(`update billing_contract_documents set "sentAt"=now() - interval '4 days' where "companyId"='${s.companyE}' and status='SENT'`)
console.log('H desativar admin', sc(offH), offH.body.active)

const n0 = lastEmailN()
const run = await api('POST', '/admin/billing/jobs/run', { token: T })
console.log('run', sc(run), j(run.body))
const mails = emailsSince(n0)
console.log('emails:', j(mails.map((m) => ({ to: m.body.to, subject: m.body.subject, key: m.idempotencyKey }))))

const g = sqlJson(`select co.active, co."intelligenceEnabled", c.status from companies co join billing_company_contracts c on c."companyId"=co.id where co.id='${s.companyG}'`)[0]
check('016.encerramento', run.body.contractsEnded === 1 && g.status === 'CANCELLED' && g.intelligenceEnabled === false && g.active === false && gBefore.intelligenceEnabled === true,
  `contractsEnded=${run.body.contractsEnded} antes=${j(gBefore)} depois=${j(g)}`)
const due = mails.filter((m) => /vence em/.test(m.body.subject))
check('016.lembrete-vencimento-1a-vez', run.body.dueReminders.sent === 1 && due.length === 1 && due[0].idempotencyKey === `invoice:${s.invBAug}:due-reminder`, `summary=${j(run.body.dueReminders)} emails=${j(due.map((m) => m.body.to))}`)
const docRem = mails.filter((m) => /Lembrete: .*aguardando seu aceite/.test(m.body.subject))
check('016.lembrete-documento', run.body.documentReminders.sent === 1 && docRem.length === 1 && j(docRem[0].body.to) === j(['eva@exemplo.test']), `summary=${j(run.body.documentReminders)} to=${j(docRem.map((m) => m.body.to))}`)

// ─── 017: o aviso de suspensão ───────────────────────────────────────────────
const notices = sqlJson(`select "companyId", payload, "createdAt" from billing_events where type='SUSPENSION_NOTICE_SENT'`)
const nB = notices.find((n) => n.companyId === s.companyB), nC = notices.find((n) => n.companyId === s.companyC), nH = notices.find((n) => n.companyId === s.companyH)
const todayYmd = sql(`select to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD')`)
const addYmd = (ymd, d) => { const t = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + d)); return t.toISOString().slice(0, 10).replace(/-/g, '') }
const dueB = '20261005', dueC = addYmd(todayYmd, -1)
const expB = [addYmd(dueB, 15), addYmd(todayYmd, 10)].sort().pop()
const expC = [addYmd(dueC, 15), addYmd(todayYmd, 10)].sort().pop()
const noticeMails = mails.filter((m) => /Aviso de suspensão/.test(m.body.subject))
check('017.aviso-gravado-data-prevista', nB?.payload.plannedBlockYmd === expB && nC?.payload.plannedBlockYmd === expC && !nH && noticeMails.length === 2 && run.body.suspensionNotices.sent === 2 && run.body.suspensionNotices.skipped === 1,
  `B: venc ${dueB} → prevista ${nB?.payload.plannedBlockYmd} (esperado ${expB}, piso de 10 dias); C: venc ${dueC} → ${nC?.payload.plannedBlockYmd} (esperado ${expC}, venc+15); H sem destinatário: ${nH ? 'GRAVADO' : 'não gravado'}; e-mails de aviso=${noticeMails.length}; summary=${j(run.body.suspensionNotices)}`)
console.log('aviso B html:', noticeMails.find((m) => m.body.to.includes('financeiro.beta@exemplo.test'))?.body.html.slice(0, 400))

// Segunda e terceira rodada: nada sai de novo
const n1 = lastEmailN()
const run2 = await api('POST', '/admin/billing/jobs/run', { token: s.sa3Token })
const run3 = await api('POST', '/admin/billing/jobs/run', { token: s.sa2Token })
const again = emailsSince(n1)
check('016.lembrete-uma-vez-so', run2.status === 200 && run3.status === 200 && again.length === 0 && run2.body.dueReminders.duplicate === 1 && run2.body.documentReminders.duplicate === 1,
  `run2 due=${j(run2.body.dueReminders)} doc=${j(run2.body.documentReminders)} notices=${j(run2.body.suspensionNotices)}; e-mails novos=${again.length}`)
const invCount = sql(`select count(*) from billing_invoices`)
check('016.jobs-run-repetido-sem-duplicar', run2.body.invoices.created === 0 && invCount === '8', `run2 invoices=${j(run2.body.invoices)} total de faturas=${invCount}`)
save(s)
