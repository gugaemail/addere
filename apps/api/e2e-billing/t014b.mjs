// 014 — administrador indicado, envio, aceite, hash, concorrência do aceite
import { api, login, load, save, sql, sqlJson, check, record, j, emailsSince, lastEmailN, sha256 } from './lib.mjs'
const s = load()
const T = s.saToken

async function mkUser(companyId, name, email, role) {
  const ex = sql(`select id from users where email='${email}'`)
  if (ex) return ex
  const r = await api('POST', '/users', { token: T, body: { name, email, password: 'E2e-Senha-123', role, companyId } })
  if (r.status !== 201) throw new Error(`mkUser ${email}: ${r.status} ${j(r.body)}`)
  return r.body.id
}

s.mariaId = await mkUser(s.companyA, 'Maria Souza', 'maria@exemplo.test', 'ADMIN')
s.joaoId = await mkUser(s.companyA, 'João Lima', 'joao@exemplo.test', 'ADMIN')

// Inteligência ligada à mão antes do contrato (para ver o aceite Padrão desligar)
sql(`update companies set "intelligenceEnabled"=true where id='${s.companyA}'`)

// Prévia: todos os campos preenchidos
const prev = await api('POST', `/admin/billing/clients/${s.companyA}/documents/preview`, { token: T, body: {} })
check('014.previa-campos', prev.status === 200 && prev.body.missing.length === 0, `${prev.status} kind=${prev.body.kind} missing=${j(prev.body.missing)}`)

// Envio sem indicado
const noDes = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
check('014.envio-sem-indicado', noDes.status === 422 && noDes.body.code === 'DESIGNATED_ADMIN_REQUIRED', `${noDes.status} ${noDes.body.code}`)

const des = await api('PUT', `/admin/billing/clients/${s.companyA}/designated-admin`, { token: T, body: { userId: s.mariaId } })
console.log('designate', des.status, j(des.body))

const n0 = lastEmailN()
const send = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
console.log('send', send.status, j(send.body).slice(0, 400))
s.docA1 = send.body.document?.id
const mails = emailsSince(n0)
const toAll = mails.flatMap((m) => m.body.to)
const link = `http://localhost:3000/contrato/${s.docA1}`
check('014.envio-email-so-maria', send.status === 201 && send.body.emailSent === true && mails.length === 1 && j(toAll) === j(['maria@exemplo.test']) && mails[0].body.html.includes(link) && !mails[0].body.html.includes('QUADRO-RESUMO'),
  `status=${send.status} emailSent=${send.body.emailSent} emails=${mails.length} to=${j(toAll)} linkOk=${mails[0]?.body.html.includes(link)}`)
const cst = sql(`select status from billing_company_contracts where "companyId"='${s.companyA}'`)
check('014.envio-pending', cst === 'PENDING_ACCEPTANCE', cst)

// Mexer no rascunho depois do envio cancela o documento
const n1 = lastEmailN()
const redraft = await api('PUT', `/admin/billing/clients/${s.companyA}/contract`, {
  token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1800.00', extraSeatPrice: '99.00', graceMonths: 0, dueDay: 5 },
})
const d1 = sqlJson(`select status, "cancelReason" from billing_contract_documents where id='${s.docA1}'`)[0]
const cst2 = sql(`select status from billing_company_contracts where "companyId"='${s.companyA}'`)
check('014.rascunho-depois-do-envio-cancela', redraft.status === 200 && d1.status === 'CANCELLED' && cst2 === 'DRAFT', `${redraft.status} doc=${j(d1)} contrato=${cst2}`)
// Troca de indicado cancela também
await api('PUT', `/admin/billing/clients/${s.companyA}/contract`, {
  token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1800.00', extraSeatPrice: '99.00', graceMonths: 0, dueDay: 10 },
})
const send2 = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
const des2 = await api('PUT', `/admin/billing/clients/${s.companyA}/designated-admin`, { token: T, body: { userId: s.joaoId } })
const d2 = sqlJson(`select status, "cancelReason" from billing_contract_documents where id='${send2.body.document?.id}'`)[0]
check('014.troca-indicado-cancela', send2.status === 201 && des2.body.cancelledDocuments === 1 && d2.status === 'CANCELLED', `send2=${send2.status} des2=${j(des2.body)} doc=${j(d2)}`)
await api('PUT', `/admin/billing/clients/${s.companyA}/designated-admin`, { token: T, body: { userId: s.mariaId } })
const send3 = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
s.docA = send3.body.document.id
console.log('send3', send3.status, s.docA)
// Envio em duplicidade
const dup = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
check('014.envio-duplo', dup.status === 409, `${dup.status} ${dup.body.code}`)

const maria = await login('maria@exemplo.test')
const joao = await login('joao@exemplo.test')
s.mariaToken = maria.accessToken
s.joaoToken = joao.accessToken

const docView = await api('GET', `/billing/me/documents/${s.docA}`, { token: s.mariaToken })
const hash = sha256(docView.body.renderedBody)
check('014.hash-igual-ao-gravado', hash === docView.body.sha256, `calc=${hash.slice(0, 12)} gravado=${docView.body.sha256?.slice(0, 12)}`)

const jAcc = await api('POST', `/billing/me/documents/${s.docA}/accept`, { token: s.joaoToken, body: { sha256: hash } })
check('014.joao-403', jAcc.status === 403 && jAcc.body.code === 'NOT_DESIGNATED_ADMIN', `${jAcc.status} ${jAcc.body.code}`)

const bad = await api('POST', `/billing/me/documents/${s.docA}/accept`, { token: s.mariaToken, body: { sha256: 'a'.repeat(64) } })
check('014.hash-errado-422', bad.status === 422 && bad.body.code === 'DOCUMENT_HASH_MISMATCH', `${bad.status} ${bad.body.code}`)

const UA = 'Mozilla/5.0 (E2E) NavegadorTeste/1.0'
s.acceptIp = '203.0.113.77'
const n2 = lastEmailN()
const ok = await api('POST', `/billing/me/documents/${s.docA}/accept`, { token: s.mariaToken, body: { sha256: hash.toUpperCase() }, headers: { 'user-agent': UA }, ip: s.acceptIp })
const c = sqlJson(`select c.status, c."startDate"::text sd, c."firstBilledCompetence"::text fbc, (select json_agg(json_build_object('v',version,'st',status,'ef',"effectiveFrom")) from billing_contract_terms t where t."contractId"=c.id) terms from billing_company_contracts c where c."companyId"='${s.companyA}'`)[0]
const doc = sqlJson(`select status, "acceptedIp", "acceptedUserAgent", "acceptedByName", "acceptedByEmail", "acceptedAt" from billing_contract_documents where id='${s.docA}'`)[0]
const today = sql(`select (now() at time zone 'America/Sao_Paulo')::date::text`)
check('014.aceite-ok', ok.status === 200 && c.status === 'ACTIVE' && c.sd === today && c.fbc === '2026-11-01' && c.terms.some((t) => t.st === 'EFFECTIVE') && doc.acceptedIp === s.acceptIp && doc.acceptedUserAgent === UA,
  `${ok.status} contrato=${j(c)} doc=${j(doc)} hoje=${today}`)
const accMails = emailsSince(n2)
console.log('emails de confirmação:', j(accMails.map((m) => m.body.to)))
const intelA = sql(`select "intelligenceEnabled" from companies where id='${s.companyA}'`)
check('014.inteligencia-segue-tipo-padrao', intelA === 'f', `intelligenceEnabled=${intelA} (estava true à mão; contrato STANDARD)`)

const again = await api('POST', `/billing/me/documents/${s.docA}/accept`, { token: s.mariaToken, body: { sha256: hash } })
check('014.segundo-aceite-409', again.status === 409 && again.body.code === 'DOCUMENT_NOT_PENDING', `${again.status} ${again.body.code}`)

// PUT /intel/admin/config do ADMIN mudando a flag
const cfg = await api('PUT', '/intel/admin/config', { token: s.mariaToken, body: { intelligenceEnabled: true } })
check('014.intel-config-admin-403', cfg.status === 403 && cfg.body.code === 'INTEL_MANAGED_BY_CONTRACT', `${cfg.status} ${cfg.body.code}`)
const cfgSa = await api('PUT', '/intel/admin/config', { token: T, body: { companyId: s.companyA, intelligenceEnabled: true } })
check('014.intel-config-superadmin-409', cfgSa.status === 409 && cfgSa.body.code === 'INTEL_MANAGED_BY_CONTRACT', `${cfgSa.status} ${cfgSa.body.code}`)
save(s)
