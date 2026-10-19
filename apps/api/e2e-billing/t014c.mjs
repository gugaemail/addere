// 014 — concorrência do aceite (empresa B, Com Inteligência) e prévia completa
import { api, login, load, save, sql, sqlJson, check, record, j, sha256 } from './lib.mjs'
const s = load()
const T = s.saToken

async function mkUser(companyId, name, email, role) {
  const ex = sql(`select id from users where email='${email}'`)
  if (ex) return ex
  const r = await api('POST', '/users', { token: T, body: { name, email, password: 'E2e-Senha-123', role, companyId } })
  if (r.status !== 201) throw new Error(`mkUser ${email}: ${r.status} ${j(r.body)}`)
  return r.body.id
}

async function setupAndSend(companyId, adminName, adminEmail, draftBody) {
  const adminId = await mkUser(companyId, adminName, adminEmail, 'ADMIN')
  const d = await api('PUT', `/admin/billing/clients/${companyId}/contract`, { token: T, body: draftBody })
  if (d.status !== 200) throw new Error(`draft ${d.status} ${j(d.body)}`)
  await api('PUT', `/admin/billing/clients/${companyId}/designated-admin`, { token: T, body: { userId: adminId } })
  const prev = await api('POST', `/admin/billing/clients/${companyId}/documents/preview`, { token: T, body: {} })
  const send = await api('POST', `/admin/billing/clients/${companyId}/documents/send`, { token: T, body: {} })
  if (send.status !== 201) throw new Error(`send ${send.status} ${j(send.body)}`)
  const tok = (await login(adminEmail)).accessToken
  return { adminId, tok, docId: send.body.document.id, prev }
}

// B: Com Inteligência, carência 1, 5 aceites simultâneos (no e2e original isto
// veio de uma 1ª execução do script; aqui é refeito do zero)
if (sql(`select coalesce(status::text,'') from billing_company_contracts where "companyId"='${s.companyB}'`) !== 'ACTIVE') {
  const B = await setupAndSend(s.companyB, 'Bruna Alves', 'bruna@exemplo.test', {
    packageId: s.packages.P20, licenseType: 'INTELLIGENCE', extraSeats: 2, packagePrice: '3200.00', extraSeatPrice: '150.50', graceMonths: 1, dueDay: 5,
  })
  const intelBefore = sql(`select "intelligenceEnabled" from companies where id='${s.companyB}'`)
  const vB = await api('GET', `/billing/me/documents/${B.docId}`, { token: B.tok })
  const hB = sha256(vB.body.renderedBody)
  const rb = await Promise.all([0, 1, 2, 3, 4].map(() => api('POST', `/billing/me/documents/${B.docId}/accept`, { token: B.tok, body: { sha256: hB } })))
  const nAcc = Number(sql(`select count(*) from billing_events where "companyId"='${s.companyB}' and type='DOCUMENT_ACCEPTED'`))
  const tB = sqlJson(`select t.status, c."firstBilledCompetence"::text fbc from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyB}'`)
  const intelAfter = sql(`select "intelligenceEnabled" from companies where id='${s.companyB}'`)
  const applied = Number(sql(`select count(*) from billing_events where "companyId"='${s.companyB}' and type='INTELLIGENCE_APPLIED'`))
  check('014.aceite-concorrente-5x', rb.filter((r) => r.status === 200).length === 1 && rb.filter((r) => r.status === 409).length === 4 && nAcc === 1 && tB.every((t) => t.status === 'EFFECTIVE'),
    `${j(rb.map((r) => `${r.status}${r.body.code ? ':' + r.body.code : ''}`))} eventos DOCUMENT_ACCEPTED=${nAcc} termos=${j(tB)}`)
  check('014.inteligencia-segue-tipo-intel', intelBefore === 'f' && intelAfter === 't' && applied === 1, `intelligenceEnabled ${intelBefore} → ${intelAfter}, INTELLIGENCE_APPLIED=${applied}`)
  check('013.calendario-carencia', tB[0]?.fbc === '2026-12-01', `carência 1, aceite hoje → firstBilledCompetence ${tB[0]?.fbc}`)
}
s.brunaId = sql(`select id from users where email='bruna@exemplo.test'`)
s.brunaToken = (await login('bruna@exemplo.test')).accessToken
s.docB = sql(`select id from billing_contract_documents where "companyId"='${s.companyB}' and status='ACCEPTED'`)
// C: Pacote 10 Padrão, aceite concorrente com 2 abas, repetido
const C = await setupAndSend(s.companyC, 'Carla Reis', 'carla@exemplo.test', {
  packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1500.00', extraSeatPrice: '120.00', graceMonths: 0, dueDay: 1,
})
s.carlaId = C.adminId; s.carlaToken = C.tok; s.docC = C.docId
const vC = await api('GET', `/billing/me/documents/${C.docId}`, { token: C.tok })
const hC = sha256(vC.body.renderedBody)
const rc = await Promise.all([0, 1].map(() => api('POST', `/billing/me/documents/${C.docId}/accept`, { token: C.tok, body: { sha256: hC } })))
check('014.aceite-concorrente-2x', rc.filter((r) => r.status === 200).length === 1 && rc.filter((r) => r.status === 409).length === 1, j(rc.map((r) => `${r.status}${r.body.code ? ':' + r.body.code : ''}`)))
save(s)
