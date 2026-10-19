// Corrida: aceite do ADITIVO × edição do aditivo (saveAmendment) ao mesmo tempo.
// Ruim: termos v2 EFFECTIVE com extraSeats diferente do texto aceito (1).
// Esperado depois do conserto, por tentativa, um destes:
//   A) aceite 200, edição 409 (TERMS_NOT_EDITABLE), v2 EFFECTIVE com 1;
//   B) edição 200, documento CANCELLED, aceite 409 DOCUMENT_NOT_PENDING, v2 PROPOSED com 5.
// Sem termsVersion no corpo (cliente antigo), o aceite primeiro dá um terceiro
// desfecho legítimo: C) aceite 200 e edição 200 que cria a proposta v3 (a v2
// aceita fica intacta).
// Uso: node race2.mjs <N> <tag de 1 letra> [comversao|semversao]
import fs from 'node:fs'
import path from 'node:path'
import { api, login, load, sqlJson, j, sha256, sleep, DIR, DB } from './lib.mjs'
const s = load()
const T = s.saToken
const N = Number(process.argv[2] ?? 8)
const tag = process.argv[3] ?? 'a'
const withVersion = (process.argv[4] ?? 'comversao') === 'comversao'
const LOG = path.join(DIR, 'logs', `api-${DB}.log`)
const deadlocks = () => {
  // Uma linha JSON do handler global por 500 (o Prisma loga o mesmo erro de novo)
  try { return fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter((l) => l.includes('Erro não tratado') && l.includes('deadlock detected')).length } catch { return 0 }
}
const dl0 = deadlocks()
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const results = []
for (let k = 0; k < N; k++) {
  const cnpj = `8${tag}.${String(k).padStart(3, '0')}.000/0001-${String(k % 100).padStart(2, '0')}`
  const c = await api('POST', '/companies', { token: T, body: { name: `Aditivo ${tag}${k}`, cnpj, profile: {
    legalName: `Aditivo ${tag}${k} Ltda`, addressStreet: 'Rua A', addressNumber: '1', addressDistrict: 'Centro', addressCity: 'Campinas', addressState: 'SP', addressZip: '13010-000',
    legalRepName: 'Rep', legalRepCpf: '529.982.247-25', legalRepRole: 'Sócio', contactName: 'C', contactEmail: `ca${tag}${k}@exemplo.test`, billingEmail: `fa${tag}${k}@exemplo.test` } } })
  const cid = c.body.id
  const email = `adm-ad-${tag}${k}@exemplo.test`
  const u = await api('POST', '/users', { token: T, body: { name: `Adm ad ${tag}${k}`, email, password: 'E2e-Senha-123', role: 'ADMIN', companyId: cid } })
  await api('PUT', `/admin/billing/clients/${cid}/contract`, { token: T, body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1000.00', extraSeatPrice: '10.00', graceMonths: 0, dueDay: 10 } })
  await api('PUT', `/admin/billing/clients/${cid}/designated-admin`, { token: T, body: { userId: u.body.id } })
  const send = await api('POST', `/admin/billing/clients/${cid}/documents/send`, { token: T, body: {} })
  const tok = (await login(email)).accessToken
  const v = await api('GET', `/billing/me/documents/${send.body.document.id}`, { token: tok })
  const a0 = await api('POST', `/billing/me/documents/${send.body.document.id}/accept`, { token: tok, body: { sha256: sha256(v.body.renderedBody) } })
  const am = { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 1, packagePrice: '1000.00', extraSeatPrice: '10.00', reason: 'Mais uma licença', requestedByClient: false }
  const sv = await api('PUT', `/admin/billing/clients/${cid}/amendment`, { token: T, body: am })
  const sd = await api('POST', `/admin/billing/clients/${cid}/documents/send`, { token: T, body: {} })
  if (a0.status !== 200 || sv.status !== 200 || sd.status !== 201) { console.log('setup', a0.status, sv.status, j(sv.body), sd.status, j(sd.body)); continue }
  const docId = sd.body.document.id
  const v2 = await api('GET', `/billing/me/documents/${docId}`, { token: tok })
  const h = sha256(v2.body.renderedBody)
  const jitter = k % 6
  // O painel manda a versão que está editando (a v2); o cliente antigo, não
  const edit = withVersion ? { ...am, extraSeats: 5, termsVersion: 2 } : { ...am, extraSeats: 5 }
  const [acc, ed] = await Promise.all([
    api('POST', `/billing/me/documents/${docId}/accept`, { token: tok, body: { sha256: h } }),
    (async () => { await sleep(jitter); return api('PUT', `/admin/billing/clients/${cid}/amendment`, { token: T, body: edit }) })(),
  ])
  const st = sqlJson(`select (select json_agg(json_build_object('v',version,'st',status,'es',"extraSeats") order by version) from billing_contract_terms t where t."contractId"=c.id) terms,
    (select json_agg(json_build_object('k',kind,'st',status) order by "sentAt") from billing_contract_documents d where d."contractId"=c.id) docs from billing_company_contracts c where c."companyId"='${cid}'`)[0]
  const v2t = st.terms.find((t) => t.v === 2)
  const v3t = st.terms.find((t) => t.v === 3)
  const amendDoc = st.docs.filter((d) => d.k === 'AMENDMENT').map((d) => d.st).join()
  const bad = v2t?.st === 'EFFECTIVE' && v2t.es !== 1
  let outcome = 'outro'
  if (bad) outcome = 'RUIM'
  else if (acc.status === 200 && ed.status === 409 && v2t?.st === 'EFFECTIVE' && v2t.es === 1 && !v3t && amendDoc === 'ACCEPTED') outcome = 'A'
  else if (ed.status === 200 && acc.status === 409 && v2t?.st === 'PROPOSED' && v2t.es === 5 && !v3t && amendDoc === 'CANCELLED') outcome = 'B'
  else if (acc.status === 200 && ed.status === 200 && v2t?.st === 'EFFECTIVE' && v2t.es === 1 && v3t?.st === 'PROPOSED' && v3t.es === 5) outcome = 'C'
  results.push({ k, jitter, outcome, accept: sc(acc), edit: sc(ed), terms: st.terms, docs: st.docs, bad })
  console.log(j(results[results.length - 1]))
}
const count = (f) => results.filter(f).length
const summary = {
  script: 'race2', db: DB, tag, termsVersion: withVersion, tentativas: results.length,
  A_aceite_200_edicao_409: count((r) => r.outcome === 'A'),
  B_edicao_200_aceite_409: count((r) => r.outcome === 'B'),
  C_aceite_200_proposta_v3: count((r) => r.outcome === 'C'),
  ruins: count((r) => r.bad),
  outros: count((r) => r.outcome === 'outro'),
  respostas_500: count((r) => r.accept.startsWith('500') || r.edit.startsWith('500')),
  deadlocks_no_log: deadlocks() - dl0,
}
console.log('RESUMO', j(summary))
fs.appendFileSync(path.join(DIR, 'races.jsonl'), j({ at: new Date().toISOString(), ...summary }) + '\n')
