// Preparação do 016: empresas E (aguardando aceite), F (sem contrato), G e H (aceitas), viagem no tempo
import { api, login, load, save, sql, check, j, sha256 } from './lib.mjs'
const s = load()
const T = s.saToken

async function mkCompany(n, cnpj) {
  const ex = sql(`select id from companies where cnpj='${cnpj}'`)
  if (ex) return ex
  const r = await api('POST', '/companies', { token: T, body: { name: `Cliente ${n}`, cnpj, profile: {
    legalName: `Cliente ${n} Ltda`, addressStreet: 'Rua A', addressNumber: '1', addressDistrict: 'Centro', addressCity: 'Campinas', addressState: 'SP', addressZip: '13010-000',
    legalRepName: `Rep ${n}`, legalRepCpf: '529.982.247-25', legalRepRole: 'Sócio', contactName: `Contato ${n}`, contactEmail: `contato.${n.toLowerCase()}@exemplo.test`,
    billingContactName: `Fin ${n}`, billingEmail: `financeiro.${n.toLowerCase()}@exemplo.test` } } })
  if (r.status !== 201) throw new Error(`company ${n}: ${r.status} ${j(r.body)}`)
  return r.body.id
}
async function mkUser(companyId, name, email, role) {
  const ex = sql(`select id from users where email='${email}'`)
  if (ex) return ex
  const r = await api('POST', '/users', { token: T, body: { name, email, password: 'E2e-Senha-123', role, companyId } })
  if (r.status !== 201) throw new Error(`mkUser ${email}: ${r.status} ${j(r.body)}`)
  return r.body.id
}
async function draftAndSend(companyId, adminId, body) {
  const d = await api('PUT', `/admin/billing/clients/${companyId}/contract`, { token: T, body })
  if (d.status !== 200) throw new Error(`draft ${d.status} ${j(d.body)}`)
  await api('PUT', `/admin/billing/clients/${companyId}/designated-admin`, { token: T, body: { userId: adminId } })
  const send = await api('POST', `/admin/billing/clients/${companyId}/documents/send`, { token: T, body: {} })
  if (send.status !== 201) throw new Error(`send ${send.status} ${j(send.body)}`)
  return send.body.document.id
}
async function accept(email, docId) {
  const tok = (await login(email)).accessToken
  const v = await api('GET', `/billing/me/documents/${docId}`, { token: tok })
  const r = await api('POST', `/billing/me/documents/${docId}/accept`, { token: tok, body: { sha256: sha256(v.body.renderedBody) } })
  if (r.status !== 200) throw new Error(`accept ${r.status} ${j(r.body)}`)
  return tok
}

// E: aguardando aceite
s.evaId = await mkUser(s.companyE, 'Eva Martins', 'eva@exemplo.test', 'ADMIN')
if (sql(`select coalesce(status::text,'') from billing_company_contracts where "companyId"='${s.companyE}'`) !== 'PENDING_ACCEPTANCE') {
  s.docE = await draftAndSend(s.companyE, s.evaId, { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '900.00', extraSeatPrice: '45.00', graceMonths: 0, dueDay: 10 })
}
// F: sem contrato
s.companyF = await mkCompany('Zeta', '66.666.666/0001-66')
s.fabioId = await mkUser(s.companyF, 'Fábio Nunes', 'fabio@exemplo.test', 'ADMIN')
// G: Com Inteligência, para o cancelamento com desativação
s.companyG = await mkCompany('Eta', '77.777.777/0001-77')
s.gilId = await mkUser(s.companyG, 'Gil Prado', 'gil@exemplo.test', 'ADMIN')
if (sql(`select coalesce(status::text,'') from billing_company_contracts where "companyId"='${s.companyG}'`) !== 'ACTIVE') {
  const doc = await draftAndSend(s.companyG, s.gilId, { packageId: s.packages.P30, licenseType: 'INTELLIGENCE', extraSeats: 0, packagePrice: '4000.00', extraSeatPrice: '130.00', graceMonths: 0, dueDay: 10 })
  await accept('gil@exemplo.test', doc)
}
// H: Padrão, para a fatura vencida há 60 dias sem aviso
s.companyH = await mkCompany('Teta', '88.888.888/0001-88')
s.heloId = await mkUser(s.companyH, 'Helô Dias', 'helo@exemplo.test', 'ADMIN')
if (sql(`select coalesce(status::text,'') from billing_company_contracts where "companyId"='${s.companyH}'`) !== 'ACTIVE') {
  const doc = await draftAndSend(s.companyH, s.heloId, { packageId: s.packages.UNLIMITED, licenseType: 'STANDARD', includedSeats: 100, extraSeats: 0, packagePrice: '5000.00', extraSeatPrice: '0.00', graceMonths: 0, dueDay: 3 })
  await accept('helo@exemplo.test', doc)
}

// Segundo superadmin (para o jobs/run concorrente e o limite de 3/min por usuário)
for (const e of ['superadmin2@exemplo.test', 'superadmin3@exemplo.test']) {
  if (!sql(`select id from users where email='${e}'`)) {
    const hash = sql(`select password from users where email='superadmin@exemplo.test'`)
    sql(`insert into users (id, name, email, password, role, active, "createdAt", "updatedAt") values (gen_random_uuid()::text, 'Super E2E ${e[10]}', '${e}', '${hash}', 'SUPERADMIN', true, now(), now())`)
  }
}

// ─── Viagem no tempo (só o banco local) ─────────────────────────────────────
const tt = (cid, start, fbc, eff) => {
  sql(`update billing_company_contracts set "startDate"='${start}', "firstBilledCompetence"='${fbc}' where "companyId"='${cid}'`)
  sql(`update billing_contract_terms t set "effectiveFrom"='${eff}' from billing_company_contracts c where c.id=t."contractId" and c."companyId"='${cid}' and t.version=1`)
}
tt(s.companyB, '2026-07-20', '2026-08-01', '2026-07-20 14:00:00')
tt(s.companyC, '2026-08-10', '2026-09-01', '2026-08-10 14:00:00')
tt(s.companyG, '2026-08-05', '2026-09-01', '2026-08-05 14:00:00')
tt(s.companyH, '2026-06-02', '2026-07-01', '2026-06-02 14:00:00')
// DRAFT e PENDING com firstBilledCompetence no passado (artificial): nunca podem faturar
sql(`update billing_company_contracts set "firstBilledCompetence"='2026-09-01' where "companyId" in ('${s.companyD}','${s.companyE}')`)
console.log(sql(`select co.name, c.status, c."startDate", c."firstBilledCompetence", c."dueDay" from billing_company_contracts c join companies co on co.id=c."companyId" order by co.name`))
save(s)
