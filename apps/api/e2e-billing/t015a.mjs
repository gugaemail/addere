// 015 — limite de licenças: antes do aceite, no limite, os caminhos e a concorrência
import { api, login, load, save, sql, sqlJson, check, record, j } from './lib.mjs'
const s = load()
const T = s.saToken
const PW = 'E2e-Senha-123'
let seq = Number(s.vseq ?? 0)
const nextEmail = (p) => `${p}-${String(++seq).padStart(3, '0')}@exemplo.test`
const active = (cid) => Number(sql(`select count(*) from users where "companyId"='${cid}' and role='SALESPERSON' and active`))
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`

// ─── Antes do aceite: D com rascunho P10, E sem contrato ─────────────────────
await api('PUT', `/admin/billing/clients/${s.companyD}/contract`, { token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1000.00', extraSeatPrice: '50.00', graceMonths: 0, dueDay: 10 } })
const dRes = []
for (let i = 0; i < 12; i++) {
  dRes.push(await api('POST', `/companies/${s.companyD}/users`, { token: T, body: { name: `Vend D ${i}`, email: nextEmail('vend-d'), password: PW, role: 'SALESPERSON' } }))
}
check('015.antes-do-aceite-12-passam', dRes.every((r) => r.status === 201) && active(s.companyD) >= 12, `D (DRAFT P10): ${dRes.filter((r) => r.status === 201).length}/12 criados, ativos=${active(s.companyD)}`)

// ─── A: Pacote 10 (termos v2), ACTIVE ────────────────────────────────────────
const used0 = active(s.companyA)
const toCreate = 9 - used0
for (let i = 0; i < toCreate; i++) {
  const r = await api('POST', '/users', { token: s.mariaToken, body: { name: `Vend A ${seq + 1}`, email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
  if (r.status !== 201) throw new Error(`criar vendedor A: ${sc(r)} ${j(r.body)}`)
}
console.log('A ativos:', active(s.companyA))
const seats = await api('GET', '/billing/me/seats', { token: s.mariaToken })
console.log('seats', j(seats.body))
const tenth = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend A décimo', email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
const eleventh = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend A 11', email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
check('015.caminho1-post-users', tenth.status === 201 && eleventh.status === 409 && eleventh.body.code === 'SEAT_LIMIT_REACHED' && eleventh.body.details?.used === 10 && eleventh.body.details?.limit === 10,
  `10º=${sc(tenth)} 11º=${sc(eleventh)} details=${j(eleventh.body.details)} ativos=${active(s.companyA)}`)
const p2 = await api('POST', `/companies/${s.companyA}/users`, { token: s.mariaToken, body: { name: 'Vend A via empresa', email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
check('015.caminho2-post-companies-users', p2.status === 409 && p2.body.code === 'SEAT_LIMIT_REACHED', `${sc(p2)} ${j(p2.body.details)}`)
const p2sa = await api('POST', `/companies/${s.companyA}/users`, { token: T, body: { name: 'Vend A via empresa SA', email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
check('015.caminho2-superadmin-tambem', p2sa.status === 409 && p2sa.body.code === 'SEAT_LIMIT_REACHED', sc(p2sa))
// ADMIN continua grátis no limite
const admX = await api('POST', '/users', { token: T, body: { name: 'Admin Extra A', email: nextEmail('adm-a'), password: PW, role: 'ADMIN', companyId: s.companyA } })
check('015.admin-gratis-no-limite', admX.status === 201, sc(admX))
s.adminExtraA = admX.body.id

// Caminho 3: desativa um (libera), cria outro (enche), reativa o primeiro → 409
const sellers = sqlJson(`select id, email from users where "companyId"='${s.companyA}' and role='SALESPERSON' and active order by "createdAt"`)
const x = sellers[0]
const off = await api('PATCH', `/users/${x.id}/active`, { token: s.mariaToken })
const afterOff = active(s.companyA)
const fill = await api('POST', '/users', { token: s.mariaToken, body: { name: 'Vend A refill', email: nextEmail('vend-a'), password: PW, role: 'SALESPERSON' } })
check('015.desativar-libera', off.status === 200 && off.body.active === false && afterOff === 9 && fill.status === 201, `desativar=${sc(off)} ativos depois=${afterOff} nova criação=${sc(fill)}`)
const p3 = await api('PATCH', `/users/${x.id}/active`, { token: s.mariaToken })
check('015.caminho3-patch-users-active', p3.status === 409 && p3.body.code === 'SEAT_LIMIT_REACHED', `${sc(p3)} ativos=${active(s.companyA)}`)
const p4 = await api('PATCH', `/companies/${s.companyA}/users/${x.id}/active`, { token: s.mariaToken, body: { active: true } })
check('015.caminho4-companies-users-active', p4.status === 409 && p4.body.code === 'SEAT_LIMIT_REACHED', `${sc(p4)} ativos=${active(s.companyA)}`)

// Caminho 5: ADMIN → vendedor (João). Sessão do João não pode cair com a recusa
const joaoTokensBefore = Number(sql(`select count(*) from refresh_tokens where "userId"='${s.joaoId}'`))
const p5 = await api('PATCH', `/users/${s.joaoId}`, { token: T, body: { role: 'SALESPERSON' } })
const p5b = await api('PATCH', `/companies/${s.companyA}/users/${s.joaoId}`, { token: s.mariaToken, body: { role: 'SALESPERSON' } })
const joaoRole = sql(`select role from users where id='${s.joaoId}'`)
const joaoTokensAfter = Number(sql(`select count(*) from refresh_tokens where "userId"='${s.joaoId}'`))
check('015.caminho5-admin-para-vendedor', p5.status === 409 && p5.body.code === 'SEAT_LIMIT_REACHED' && p5b.status === 409 && joaoRole === 'ADMIN' && joaoTokensAfter === joaoTokensBefore,
  `PATCH /users=${sc(p5)} PATCH /companies/../users=${sc(p5b)} role=${joaoRole} refreshTokens ${joaoTokensBefore}→${joaoTokensAfter}`)

// Caminho 6: órfão
const orphan = await api('POST', '/users', { token: T, body: { name: 'Órfão', email: nextEmail('orfao'), password: PW, role: 'SALESPERSON' } })
const p6 = await api('PATCH', `/users/${orphan.body.id}`, { token: T, body: { companyId: s.companyA } })
const orphanCompany = sql(`select coalesce("companyId",'null') from users where id='${orphan.body.id}'`)
check('015.caminho6-orfao', orphan.status === 201 && p6.status === 409 && p6.body.code === 'SEAT_LIMIT_REACHED' && orphanCompany === 'null', `criar órfão=${sc(orphan)} vincular=${sc(p6)} companyId=${orphanCompany}`)
s.orphanId = orphan.body.id
console.log('A ativos final:', active(s.companyA))
s.vseq = seq
save(s)
