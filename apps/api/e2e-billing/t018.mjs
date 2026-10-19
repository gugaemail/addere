// 018 — painel: números calculados à mão pelo banco e comparados com a API; lista de clientes
import { api, load, save, sql, sqlJson, check, j } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const today = sql(`select (now() at time zone 'America/Sao_Paulo')::date::text`)

// G: paga a fatura de setembro (o mês do cancelamento) para a situação dela ser "cancelado"
if (sql(`select status from billing_invoices where id='${s.invG}'`) === 'OPEN') {
  const p = await api('POST', `/admin/billing/invoices/${s.invG}/pay`, { token: T, body: { paidAt: today, amount: '4000.00', method: 'TRANSFER' } })
  console.log('pagar G', sc(p))
}

// ─── Esperado, calculado só com SQL ──────────────────────────────────────────
const cur = sqlJson(`
  with cur as (
    select distinct on (c.id) c.id cid, c."companyId", t."packagePrice" pp, t."extraSeats" es, t."extraSeatPrice" ep, t."includedSeats" inc
    from billing_company_contracts c join billing_contract_terms t on t."contractId"=c.id
    where c.status='ACTIVE' and t.status='EFFECTIVE' and t."effectiveFrom" <= now() at time zone 'UTC'
    order by c.id, t."effectiveFrom" desc, t.version desc)
  select co.name, (pp + es*ep)::numeric(14,2)::text monthly, (inc+es) lim,
    (select count(*) from users u where u."companyId"=cur."companyId" and u.role='SALESPERSON' and u.active) used
  from cur join companies co on co.id=cur."companyId" order by co.name`)
const cents = (x) => Math.round(Number(x) * 100)
const fmt = (c) => (c / 100).toFixed(2)
const expMrr = fmt(cur.reduce((a, r) => a + cents(r.monthly), 0))
const inv = sqlJson(`select status, total::text total, "dueDate"::text due, "paidAt"::text paid, "paidAmount"::text amt, to_char(competence,'YYYY-MM') comp from billing_invoices where status <> 'CANCELLED'`)
const openI = inv.filter((i) => i.status === 'OPEN')
const overdueI = openI.filter((i) => i.due < today)
const plus15 = sql(`select ((now() at time zone 'America/Sao_Paulo')::date + 15)::text`)
const upcomingI = openI.filter((i) => i.due >= today && i.due <= plus15)
const curMonth = today.slice(0, 7)
const recI = inv.filter((i) => i.status === 'PAID' && i.paid?.slice(0, 7) === curMonth)
const exp = {
  contracted: expMrr,
  activeContracts: cur.length,
  open: { count: openI.length, amount: fmt(openI.reduce((a, i) => a + cents(i.total), 0)) },
  overdue: { count: overdueI.length, amount: fmt(overdueI.reduce((a, i) => a + cents(i.total), 0)) },
  dueNext15Days: { count: upcomingI.length, amount: fmt(upcomingI.reduce((a, i) => a + cents(i.total), 0)) },
  receivedThisMonth: { count: recI.length, amount: fmt(recI.reduce((a, i) => a + cents(i.amt ?? i.total), 0)) },
  seats: { used: cur.reduce((a, r) => a + Number(r.used), 0), limit: cur.reduce((a, r) => a + Number(r.lim), 0) },
  near: cur.filter((r) => Number(r.used) * 100 >= Number(r.lim) * 90).map((r) => r.name),
  pendingDocs: Number(sql(`select count(*) from billing_contract_documents where status='SENT'`)),
  pendingReq: Number(sql(`select count(*) from billing_license_requests where status='PENDING'`)),
  billedSep: fmt(inv.filter((i) => i.comp === '2026-09').reduce((a, i) => a + cents(i.total), 0)),
  billedAug: fmt(inv.filter((i) => i.comp === '2026-08').reduce((a, i) => a + cents(i.total), 0)),
}
console.log('termos atuais:', j(cur))
console.log('esperado:', j(exp))

const d = await api('GET', '/admin/billing/dashboard', { token: T })
console.log('API:', j({ mrr: d.body.mrr, seats: d.body.seats, receivable: d.body.receivable, clientsByStatus: d.body.clientsByStatus, near: d.body.nearSeatLimit, pa: d.body.pendingAcceptance?.total, plr: d.body.pendingLicenseRequests?.total }))
const rev = Object.fromEntries((d.body.revenue12m ?? []).map((m) => [m.month, m]))
check('018.mrr', d.status === 200 && d.body.mrr.contracted === exp.contracted && d.body.mrr.billable === exp.contracted && d.body.mrr.activeContracts === exp.activeContracts && d.body.mrr.graceContracts === 0,
  `API contracted=${d.body.mrr?.contracted} billable=${d.body.mrr?.billable} ativos=${d.body.mrr?.activeContracts} | à mão ${exp.contracted} (${cur.map((r) => `${r.name} ${r.monthly}`).join(' + ')})`)
check('018.a-receber-vencido', j(d.body.receivable.open) === j(exp.open) && j(d.body.receivable.overdue) === j(exp.overdue) && j(d.body.receivable.dueNext15Days) === j(exp.dueNext15Days),
  `API open=${j(d.body.receivable.open)} overdue=${j(d.body.receivable.overdue)} 15d=${j(d.body.receivable.dueNext15Days)} | à mão ${j(exp.open)} ${j(exp.overdue)} ${j(exp.dueNext15Days)}`)
check('018.recebido-no-mes', j(d.body.receivable.receivedThisMonth) === j(exp.receivedThisMonth), `API ${j(d.body.receivable.receivedThisMonth)} | à mão ${j(exp.receivedThisMonth)} (pelo paidAmount, não pelo total)`)
check('018.ocupacao-licencas', d.body.seats.used === exp.seats.used && d.body.seats.limit === exp.seats.limit && j(d.body.nearSeatLimit.items.map((x) => x.companyName)) === j(exp.near),
  `API ${j(d.body.seats)} perto=${j(d.body.nearSeatLimit.items)} | à mão ${j(exp.seats)} perto=${j(exp.near)}`)
check('018.pendencias', d.body.pendingAcceptance.total === exp.pendingDocs && d.body.pendingLicenseRequests.total === exp.pendingReq, `aceite API=${d.body.pendingAcceptance.total}/mão=${exp.pendingDocs}; pedidos API=${d.body.pendingLicenseRequests.total}/mão=${exp.pendingReq}`)
check('018.faturado-12m', rev['2026-09']?.billed === exp.billedSep && rev['2026-08']?.billed === exp.billedAug && !rev[curMonth], `API set=${rev['2026-09']?.billed} ago=${rev['2026-08']?.billed} | à mão set=${exp.billedSep} ago=${exp.billedAug}; meses=${(d.body.revenue12m ?? []).map((m) => m.month).join(',')}`)

const asAdmin = await api('GET', '/admin/billing/dashboard', { token: s.mariaToken })
const asVend = await api('GET', '/admin/billing/dashboard', { token: s.vendBToken })
const noTok = await api('GET', '/admin/billing/dashboard', {})
check('018.admin-403', asAdmin.status === 403 && asVend.status === 403 && noTok.status === 401, `ADMIN=${sc(asAdmin)} vendedor=${sc(asVend)} sem token=${sc(noTok)}`)

// Lista de clientes
const cl = await api('GET', '/admin/billing/clients', { token: T })
const st = Object.fromEntries((cl.body.items ?? cl.body).map((c) => [c.name ?? c.companyName, c.status]))
console.log('lista:', j(st))
const want = { 'Cliente Alfa': 'CURRENT', 'Cliente Beta': 'CURRENT', 'Cliente Gama': 'BLOCKED', 'Cliente Teta': 'OVERDUE', 'Cliente Eta': 'CANCELLED', 'Cliente Epsilon': 'AWAITING_ACCEPTANCE', 'Cliente Zeta': 'NO_CONTRACT', 'Cliente Delta': 'NO_CONTRACT' }
const diff = Object.entries(want).filter(([k, v]) => st[k] !== v)
check('018.lista-situacao', cl.status === 200 && diff.length === 0, `divergências=${j(diff.map(([k, v]) => `${k}: API ${st[k]} esperado ${v}`))}`)
const counts = {}
for (const v of Object.values(want)) counts[v] = (counts[v] ?? 0) + 1
const cbs = d.body.clientsByStatus
check('018.clientes-por-situacao', Object.entries(counts).every(([k, v]) => cbs[k] === v), `API ${j(cbs)} | esperado ${j(counts)}`)
save(s)
