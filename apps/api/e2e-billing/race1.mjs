// Corrida: aceite do contrato × edição do rascunho (saveContractDraft) ao mesmo tempo.
// Ruim: contrato ACTIVE com termos EFFECTIVE diferentes do texto aceito (1000.00).
// Esperado depois do conserto, por tentativa, um destes:
//   A) aceite 200, edição 409 CONTRACT_NOT_DRAFT, termos EFFECTIVE 1000.00;
//   B) edição 200, documento CANCELLED, aceite 409 DOCUMENT_NOT_PENDING.
// Uso: node race1.mjs <N> <tag de 1 letra>
import fs from 'node:fs'
import path from 'node:path'
import { api, login, load, sqlJson, j, sha256, sleep, DIR, DB } from './lib.mjs'
const s = load()
const T = s.saToken
const N = Number(process.argv[2] ?? 12)
const tag = process.argv[3] ?? 'r'
const LOG = path.join(DIR, 'logs', `api-${DB}.log`)
const deadlocks = () => {
  // Uma linha JSON do handler global por 500 (o Prisma loga o mesmo erro de novo)
  try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter((l) => l.includes('Erro não tratado') && l.includes('deadlock detected')).length } catch { return 0 }
}
const dl0 = deadlocks()
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const results = []
for (let k = 0; k < N; k++) {
  const cnpj = `9${tag}.${String(k).padStart(3, '0')}.000/0001-${String(k % 100).padStart(2, '0')}`
  const c = await api('POST', '/companies', { token: T, body: { name: `Corrida ${tag}${k}`, cnpj, profile: {
    legalName: `Corrida ${tag}${k} Ltda`, addressStreet: 'Rua A', addressNumber: '1', addressDistrict: 'Centro', addressCity: 'Campinas', addressState: 'SP', addressZip: '13010-000',
    legalRepName: 'Rep', legalRepCpf: '529.982.247-25', legalRepRole: 'Sócio', contactName: 'C', contactEmail: `c${tag}${k}@exemplo.test`, billingEmail: `f${tag}${k}@exemplo.test` } } })
  if (c.status !== 201) { console.log('company', c.status, j(c.body)); continue }
  const cid = c.body.id
  const email = `adm-${tag}${k}@exemplo.test`
  const u = await api('POST', '/users', { token: T, body: { name: `Adm ${tag}${k}`, email, password: 'E2e-Senha-123', role: 'ADMIN', companyId: cid } })
  const draft = { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1000.00', extraSeatPrice: '10.00', graceMonths: 0, dueDay: 10 }
  await api('PUT', `/admin/billing/clients/${cid}/contract`, { token: T, body: draft })
  await api('PUT', `/admin/billing/clients/${cid}/designated-admin`, { token: T, body: { userId: u.body.id } })
  const send = await api('POST', `/admin/billing/clients/${cid}/documents/send`, { token: T, body: {} })
  const docId = send.body.document.id
  const tok = (await login(email)).accessToken
  const v = await api('GET', `/billing/me/documents/${docId}`, { token: tok })
  const h = sha256(v.body.renderedBody)
  const jitter = k % 6 // 0..5 ms de atraso na edição
  const [acc, ed] = await Promise.all([
    api('POST', `/billing/me/documents/${docId}/accept`, { token: tok, body: { sha256: h } }),
    (async () => { await sleep(jitter); return api('PUT', `/admin/billing/clients/${cid}/contract`, { token: T, body: { ...draft, packagePrice: '9999.00' } }) })(),
  ])
  const st = sqlJson(`select c.status, (select json_agg(json_build_object('v',version,'st',status,'pp',"packagePrice"::text)) from billing_contract_terms t where t."contractId"=c.id) terms,
    (select json_agg(json_build_object('st',status,'h',left(sha256,8))) from billing_contract_documents d where d."contractId"=c.id) docs from billing_company_contracts c where c."companyId"='${cid}'`)[0]
  const eff = (st.terms ?? []).filter((t) => t.st === 'EFFECTIVE')
  const bad = st.status === 'ACTIVE' && eff.some((t) => t.pp !== '1000.00')
  const docSt = (st.docs ?? []).map((d) => d.st)
  let outcome = 'outro'
  if (bad) outcome = 'RUIM'
  else if (acc.status === 200 && ed.status === 409 && st.status === 'ACTIVE' && eff.length === 1 && eff[0].pp === '1000.00' && docSt.join() === 'ACCEPTED') outcome = 'A'
  else if (ed.status === 200 && acc.status === 409 && st.status === 'DRAFT' && docSt.join() === 'CANCELLED' && st.terms.length === 1 && st.terms[0].st === 'PROPOSED' && st.terms[0].pp === '9999.00') outcome = 'B'
  results.push({ k, jitter, outcome, accept: sc(acc), edit: sc(ed), contract: st.status, terms: st.terms, docs: st.docs, bad })
  console.log(j(results[results.length - 1]))
}
const count = (f) => results.filter(f).length
const summary = {
  script: 'race1', db: DB, tag, tentativas: results.length,
  A_aceite_200_edicao_409: count((r) => r.outcome === 'A'),
  B_edicao_200_aceite_409: count((r) => r.outcome === 'B'),
  ruins: count((r) => r.bad),
  outros: count((r) => r.outcome === 'outro'),
  respostas_500: count((r) => r.accept.startsWith('500') || r.edit.startsWith('500')),
  deadlocks_no_log: deadlocks() - dl0,
}
console.log('RESUMO', j(summary))
fs.appendFileSync(path.join(DIR, 'races.jsonl'), j({ at: new Date().toISOString(), ...summary }) + '\n')
