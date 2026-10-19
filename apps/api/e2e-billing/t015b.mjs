// 015 — concorrência real da trava de licenças: 9 de 10, 5 criações simultâneas
import { api, load, save, sql, sqlJson, check, j } from './lib.mjs'
const s = load()
const T = s.saToken
const PW = 'E2e-Senha-123'
let seq = Number(s.vseq ?? 0)
const nextEmail = (p) => `${p}-${String(++seq).padStart(3, '0')}@exemplo.test`
const active = (cid) => Number(sql(`select count(*) from users where "companyId"='${cid}' and role='SALESPERSON' and active`))
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`

async function toNine() {
  while (active(s.companyA) > 9) {
    const u = sql(`select id from users where "companyId"='${s.companyA}' and role='SALESPERSON' and active order by "createdAt" desc limit 1`)
    const r = await api('PATCH', `/companies/${s.companyA}/users/${u}/active`, { token: T, body: { active: false } })
    if (r.status !== 200) throw new Error(`desativar: ${sc(r)}`)
  }
}

for (let round = 1; round <= 3; round++) {
  await toNine()
  const before = active(s.companyA)
  const reqs = [
    api('POST', '/users', { token: s.mariaToken, body: { name: `Conc ${round}a`, email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
    api('POST', '/users', { token: s.mariaToken, body: { name: `Conc ${round}b`, email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
    api('POST', '/users', { token: T, body: { name: `Conc ${round}c`, email: nextEmail('conc'), password: PW, role: 'SALESPERSON', companyId: s.companyA } }),
    api('POST', `/companies/${s.companyA}/users`, { token: T, body: { name: `Conc ${round}d`, email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
    api('POST', `/companies/${s.companyA}/users`, { token: s.mariaToken, body: { name: `Conc ${round}e`, email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
  ]
  const rs = await Promise.all(reqs)
  const after = active(s.companyA)
  const ok = rs.filter((r) => r.status === 201).length
  const seat = rs.filter((r) => r.status === 409 && r.body.code === 'SEAT_LIMIT_REACHED').length
  check(`015.concorrencia-criacao-rodada-${round}`, before === 9 && ok === 1 && seat === 4 && after === 10, `antes=${before} respostas=${j(rs.map(sc))} depois=${after}`)
}

// Rodada mista: 3 reativações + 2 criações simultâneas, 9 de 10
await toNine()
const inactive = sqlJson(`select id from users where "companyId"='${s.companyA}' and role='SALESPERSON' and not active order by "createdAt" limit 3`).map((r) => r.id)
const before = active(s.companyA)
const rs = await Promise.all([
  ...inactive.map((id, i) => (i % 2 === 0
    ? api('PATCH', `/users/${id}/active`, { token: s.mariaToken })
    : api('PATCH', `/companies/${s.companyA}/users/${id}/active`, { token: s.mariaToken, body: { active: true } }))),
  api('POST', '/users', { token: s.mariaToken, body: { name: 'Conc mix a', email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
  api('POST', `/companies/${s.companyA}/users`, { token: T, body: { name: 'Conc mix b', email: nextEmail('conc'), password: PW, role: 'SALESPERSON' } }),
])
const after = active(s.companyA)
check('015.concorrencia-mista-reativar-criar', before === 9 && rs.filter((r) => r.status === 200 || r.status === 201).length === 1 && after === 10, `antes=${before} respostas=${j(rs.map(sc))} depois=${after}`)

// Rodada pesada: 9 de 10, 15 criações simultâneas
await toNine()
const b2 = active(s.companyA)
const heavy = await Promise.all(Array.from({ length: 15 }, (_, i) => api('POST', i % 2 ? '/users' : `/companies/${s.companyA}/users`, { token: i % 3 ? s.mariaToken : T, body: { name: `Heavy ${i}`, email: nextEmail('heavy'), password: PW, role: 'SALESPERSON', ...(i % 2 && !(i % 3) ? { companyId: s.companyA } : {}) } })))
const a2 = active(s.companyA)
const codes = {}
for (const r of heavy) codes[sc(r)] = (codes[sc(r)] ?? 0) + 1
check('015.concorrencia-15-simultaneas', b2 === 9 && heavy.filter((r) => r.status === 201).length === 1 && a2 === 10, `antes=${b2} respostas=${j(codes)} depois=${a2}`)
s.vseq = seq
save(s)
