// 017 — bloqueio automático: 9 dias não bloqueia, 10 bloqueia; sem aviso nunca; acesso bloqueado
import { api, login, load, save, sql, sqlJson, check, j, lastEmailN, emailsSince, sleep } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}${r.body?.reason ? ':' + r.body.reason : ''}`
const toks = [s.saToken, s.sa2Token, s.sa3Token]
let ti = 0
async function runJobs() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await api('POST', '/admin/billing/jobs/run', { token: toks[ti++ % 3] })
    if (r.status !== 429) return r
    await sleep(10000)
  }
  throw new Error('jobs/run 429 persistente')
}
const blockOf = (cid) => sqlJson(`select "accessBlockedAt" is not null blocked, "accessBlockReason" reason, "blockExemptUntil"::text exempt from companies where id='${cid}'`)[0]
const todayYmd = sql(`select to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD')`)
const addYmd = (ymd, d) => { const t = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + d)); return t.toISOString().slice(0, 10).replace(/-/g, '') }

// Vendedor de B
if (!sql(`select id from users where email='vendedor.beta@exemplo.test'`)) {
  const r = await api('POST', '/users', { token: T, body: { name: 'Vendedor Beta', email: 'vendedor.beta@exemplo.test', password: 'E2e-Senha-123', role: 'SALESPERSON', companyId: s.companyB } })
  if (r.status !== 201) throw new Error(`vendedor beta ${sc(r)}`)
}
const vend = await login('vendedor.beta@exemplo.test')
s.vendBToken = vend.accessToken
const base = await api('GET', '/customers', { token: s.vendBToken })
console.log('vendedor B antes', sc(base))

// Liga o bloqueio automático
const on = await api('PUT', '/admin/billing/settings', { token: T, body: { overdueBlockDays: 15, dueReminderDays: 3, notifyEmail: 'addere-cobranca@exemplo.test', autoBlockEnabled: true } })
console.log('autoBlock', sc(on), on.body.autoBlockEnabled)

// B: aviso há 9 dias, data prevista hoje → não bloqueia
const evB = `invoice:${s.invB}:suspension-notice`
sql(`update billing_events set "createdAt"=now() - interval '9 days', payload=jsonb_set(payload, '{plannedBlockYmd}', '"${todayYmd}"') where "dedupeKey"='${evB}'`)
// C: data prevista em 2 dias → lembrete
const evC = `invoice:${s.invC}:suspension-notice`
sql(`update billing_events set payload=jsonb_set(payload, '{plannedBlockYmd}', '"${addYmd(todayYmd, 2)}"') where "dedupeKey"='${evC}'`)
const n0 = lastEmailN()
const r9 = await runJobs()
const b9 = blockOf(s.companyB)
check('017.aviso-9-dias-nao-bloqueia', r9.status === 200 && b9.blocked === false, `${sc(r9)} overdueBlocks=${j(r9.body.overdueBlocks)} B=${j(b9)}`)
const rem = emailsSince(n0).filter((m) => /Lembrete: o acesso/.test(m.body.subject))
check('017.lembrete-de-suspensao', r9.body.suspensionReminders.sent === 1 && rem.length === 1 && rem[0].body.to.includes('carla@exemplo.test'), `summary=${j(r9.body.suspensionReminders)} to=${j(rem.map((m) => m.body.to))}`)

// B: aviso há 10 dias → bloqueia
sql(`update billing_events set "createdAt"=now() - interval '10 days' where "dedupeKey"='${evB}'`)
const r10 = await runJobs()
const b10 = blockOf(s.companyB)
const evBlock = sqlJson(`select payload from billing_events where type='ACCESS_BLOCKED' and "companyId"='${s.companyB}'`)
check('017.aviso-10-dias-bloqueia', b10.blocked === true && b10.reason === 'OVERDUE' && evBlock.length === 1, `${sc(r10)} overdueBlocks=${j(r10.body.overdueBlocks)} B=${j(b10)} evento=${j(evBlock)}`)
const remAgain = r10.body.suspensionReminders
check('017.lembrete-uma-vez', remAgain.sent === 0, j(remAgain))

// H: vencida há 60 dias sem aviso → nunca bloqueia
const h = blockOf(s.companyH)
const hNotice = sql(`select count(*) from billing_events where "companyId"='${s.companyH}' and type='SUSPENSION_NOTICE_SENT'`)
const hDue = sql(`select "dueDate"::text from billing_invoices where id='${s.invH}'`)
check('017.sem-aviso-nunca-bloqueia', h.blocked === false && hNotice === '0', `H venc=${hDue} avisos=${hNotice} bloqueada=${h.blocked}`)

// ─── Empresa bloqueada ───────────────────────────────────────────────────────
const vc = await api('GET', '/customers', { token: s.vendBToken })
const vo = await api('GET', '/orders', { token: s.vendBToken })
check('017.vendedor-403-company-blocked', vc.status === 403 && vc.body.code === 'COMPANY_BLOCKED' && vc.body.reason === 'OVERDUE' && vo.status === 403, `/customers=${sc(vc)} /orders=${sc(vo)}`)
const me = await api('GET', '/auth/me', { token: s.vendBToken })
check('017.auth-me-200-bloqueado', me.status === 200 && me.body.company?.access?.blocked === true && me.body.company.access.reason === 'OVERDUE', `${sc(me)} access=${j(me.body.company?.access)}`)
const perm = await api('GET', '/auth/me/permissions', { token: s.vendBToken })
const lg = await api('POST', '/auth/login', { body: { email: 'vendedor.beta@exemplo.test', password: 'E2e-Senha-123' } })
const rf = await api('POST', '/auth/refresh', { body: { refreshToken: lg.body.refreshToken } })
check('017.login-refresh-funcionam', perm.status === 200 && lg.status === 200 && rf.status === 200 && !!rf.body.accessToken, `perms=${sc(perm)} login=${sc(lg)} refresh=${sc(rf)}`)
s.vendBToken = rf.body.accessToken ?? s.vendBToken
const bruna = s.brunaToken
const bm = await api('GET', '/billing/me', { token: bruna })
const bi = await api('GET', '/billing/me/invoices', { token: bruna })
const bo = await api('GET', '/billing/me/overdue', { token: bruna })
const bd = await api('GET', '/billing/me/documents', { token: bruna })
const bu = await api('GET', '/users', { token: bruna })
check('017.admin-billing-me-liberado', bm.status === 200 && bi.status === 200 && bo.status === 200 && bd.status === 200 && bo.body.access?.blocked === true && bu.status === 403 && bu.body.code === 'COMPANY_BLOCKED',
  `/billing/me=${sc(bm)} invoices=${sc(bi)} overdue=${sc(bo)} plannedBlockDate=${bo.body.plannedBlockDate} documents=${sc(bd)} /users=${sc(bu)}`)
const saC = await api('GET', `/companies/${s.companyB}`, { token: T })
const saCl = await api('GET', `/admin/billing/clients/${s.companyB}`, { token: T })
const saUsers = await api('GET', '/users', { token: T })
check('017.superadmin-nao-afetado', saC.status === 200 && saCl.status === 200 && saUsers.status === 200, `/companies/B=${sc(saC)} /admin/billing/clients/B=${sc(saCl)} /users=${sc(saUsers)}`)
console.log('ficha B access:', j(saCl.body.access ?? saCl.body.block ?? Object.keys(saCl.body)))

// Baixa desbloqueia na hora
const today = sql(`select (now() at time zone 'America/Sao_Paulo')::date::text`)
const pay = await api('POST', `/admin/billing/invoices/${s.invB}/pay`, { token: T, body: { paidAt: today, amount: '3501.00', method: 'BOLETO' } })
const bAfter = blockOf(s.companyB)
const unEv = sqlJson(`select payload, "actorId" from billing_events where type='ACCESS_UNBLOCKED' and "companyId"='${s.companyB}'`)
const vc2 = await api('GET', '/customers', { token: s.vendBToken })
check('017.baixa-desbloqueia', pay.status === 200 && bAfter.blocked === false && unEv.length === 1 && unEv[0].payload.cause === 'PAYMENT' && vc2.status === 200, `baixa=${sc(pay)} B=${j(bAfter)} evento=${j(unEv)} vendedor /customers=${sc(vc2)}`)
save(s)
