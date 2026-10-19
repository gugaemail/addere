// 017 — "Liberar até", liberação vencida volta a bloquear, switch desligado libera, INACTIVE
import { api, login, load, save, sql, sqlJson, check, j, lastEmailN, emailsSince, sleep } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}${r.body?.reason ? ':' + r.body.reason : ''}`
const toks = [s.saToken, s.sa2Token, s.sa3Token]
let ti = 1
async function runJobs() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await api('POST', '/admin/billing/jobs/run', { token: toks[ti++ % 3] })
    if (r.status !== 429) return r
    await sleep(10000)
  }
  throw new Error('jobs/run 429 persistente')
}
const blockOf = (cid) => sqlJson(`select "accessBlockedAt" is not null blocked, "accessBlockReason" reason, "blockExemptUntil"::text exempt from companies where id='${cid}'`)[0]
const todayYmd = sql(`select to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD')`)
const plus = (d) => sql(`select ((now() at time zone 'America/Sao_Paulo')::date + ${d})::text`)
const settings = (auto) => api('PUT', '/admin/billing/settings', { token: T, body: { overdueBlockDays: 15, dueReminderDays: 3, notifyEmail: 'addere-cobranca@exemplo.test', autoBlockEnabled: auto } })

// Bloqueia C (aviso há 10 dias, data prevista hoje)
const evC = `invoice:${s.invC}:suspension-notice`
sql(`update billing_events set "createdAt"=now() - interval '10 days', payload=jsonb_set(payload, '{plannedBlockYmd}', '"${todayYmd}"') where "dedupeKey"='${evC}'`)
const r1 = await runJobs()
const c1 = blockOf(s.companyC)
console.log('C bloqueada?', j(c1), j(r1.body.overdueBlocks))

// Erros do "Liberar até"
const out = await api('POST', `/admin/billing/clients/${s.companyC}/unblock`, { token: T, body: { until: plus(91) } })
const past = await api('POST', `/admin/billing/clients/${s.companyC}/unblock`, { token: T, body: { until: plus(-1) } })
const nothing = await api('POST', `/admin/billing/clients/${s.companyF}/unblock`, { token: T, body: {} })
const asAdmin = await api('POST', `/admin/billing/clients/${s.companyC}/unblock`, { token: s.carlaToken, body: { until: plus(5) } })
check('017.liberar-validacoes', out.status === 400 && out.body.code === 'UNBLOCK_UNTIL_OUT_OF_RANGE' && past.status === 400 && nothing.status === 409 && nothing.body.code === 'NOTHING_TO_UNBLOCK' && asAdmin.status === 403,
  `+91=${sc(out)} ontem=${sc(past)} sem bloqueio=${sc(nothing)} como ADMIN (bloqueado)=${sc(asAdmin)}`)

// Liberar até hoje + 5
const n0 = lastEmailN()
const un = await api('POST', `/admin/billing/clients/${s.companyC}/unblock`, { token: T, body: { until: plus(5) } })
const mails = emailsSince(n0)
const c2 = blockOf(s.companyC)
const carlaOk = await api('GET', '/users', { token: s.carlaToken })
check('017.liberar-ate', c1.blocked === true && un.status === 200 && un.body.emailSent === true && c2.blocked === false && c2.exempt === plus(5) && mails.length === 2 && mails.every((m) => /liberado até/.test(m.body.subject)) && carlaOk.status === 200,
  `antes=${j(c1)} resposta=${sc(un)} emailSent=${un.body.emailSent} depois=${j(c2)} e-mails=${j(mails.map((m) => m.body.to))} ADMIN /users=${sc(carlaOk)}`)
const r2 = await runJobs()
const c3 = blockOf(s.companyC)
check('017.liberacao-vigente-segura', c3.blocked === false, `jobs=${j(r2.body.overdueBlocks)} C=${j(c3)}`)
// A liberação venceu ontem → bloqueia de novo
sql(`update companies set "blockExemptUntil"=((now() at time zone 'America/Sao_Paulo')::date - 1) where id='${s.companyC}'`)
const r3 = await runJobs()
const c4 = blockOf(s.companyC)
check('017.liberacao-vencida-volta-a-bloquear', c4.blocked === true && c4.reason === 'OVERDUE', `jobs=${j(r3.body.overdueBlocks)} C=${j(c4)}`)
// Switch desligado → libera (rollback)
await settings(false)
const r4 = await runJobs()
const c5 = blockOf(s.companyC)
const unEv = sqlJson(`select payload from billing_events where type='ACCESS_UNBLOCKED' and "companyId"='${s.companyC}' order by "createdAt" desc limit 1`)[0]
check('017.switch-desligado-libera', c5.blocked === false && unEv.payload.cause === 'RULE', `jobs=${j(r4.body.overdueBlocks)} C=${j(c5)} evento=${j(unEv)}`)
// Liga de novo e deixa C bloqueada (para o painel)
await settings(true)
const r5 = await runJobs()
console.log('C de volta ao bloqueio:', j(blockOf(s.companyC)), j(r5.body.overdueBlocks))

// ─── INACTIVE ─────────────────────────────────────────────────────────────────
const gil = (await login('gil@exemplo.test')).accessToken
const gc = await api('GET', '/customers', { token: gil })
const gme = await api('GET', '/auth/me', { token: gil })
check('017.empresa-inativa-403-inactive', gc.status === 403 && gc.body.code === 'COMPANY_BLOCKED' && gc.body.reason === 'INACTIVE' && gme.status === 200 && gme.body.company.access.reason === 'INACTIVE',
  `G (contrato encerrado com desativação): /customers=${sc(gc)} /auth/me=${sc(gme)} access=${j(gme.body.company?.access)}`)
const fabio = (await login('fabio@exemplo.test')).accessToken
const offF = await api('PATCH', `/companies/${s.companyF}/active`, { token: T, body: { active: false } })
const fu = await api('GET', '/users', { token: fabio })
const fb = await api('GET', '/billing/me', { token: fabio })
const onF = await api('PATCH', `/companies/${s.companyF}/active`, { token: T, body: { active: true } })
const fu2 = await api('GET', '/users', { token: fabio })
check('017.desativar-ativar-empresa', offF.status === 200 && fu.status === 403 && fu.body.reason === 'INACTIVE' && fb.status === 200 && onF.status === 200 && fu2.status === 200,
  `desativar=${sc(offF)} /users=${sc(fu)} /billing/me=${sc(fb)} reativar=${sc(onF)} /users=${sc(fu2)}`)
const saMe = await api('GET', '/auth/me', { token: T })
check('017.superadmin-sem-empresa-passa', saMe.status === 200 && saMe.body.company === null, `${sc(saMe)} company=${j(saMe.body.company)}`)
save(s)
