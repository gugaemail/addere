// 014 — aditivo Padrão → Com Inteligência com aumento; 30 dias; termos antigos valem até a data
import { api, load, save, sql, sqlJson, check, record, j, sha256, lastEmailN, emailsSince } from './lib.mjs'
const s = load()
const T = s.saToken
const base = { packageId: s.packages.P10, licenseType: 'INTELLIGENCE', extraSeats: 0, packagePrice: '2500.00', extraSeatPrice: '99.00', reason: 'Upgrade para Com Inteligência', requestedByClient: false }

const noDate = await api('PUT', `/admin/billing/clients/${s.companyA}/amendment`, { token: T, body: base })
check('014.aditivo-aumento-sem-data', noDate.status === 422 && noDate.body.code === 'AMENDMENT_NOTICE_TOO_SHORT', `${noDate.status} ${noDate.body.code} min=${noDate.body.details?.minimumEffectiveFrom} msg=${noDate.body.message}`)
const min = noDate.body.details?.minimumEffectiveFrom
const dayBefore = new Date(Date.parse(min + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10)
const early = await api('PUT', `/admin/billing/clients/${s.companyA}/amendment`, { token: T, body: { ...base, proposedEffectiveFrom: dayBefore } })
check('014.aditivo-29-dias', early.status === 422 && early.body.code === 'AMENDMENT_NOTICE_TOO_SHORT', `${dayBefore}: ${early.status} ${early.body.code}`)
const okSave = await api('PUT', `/admin/billing/clients/${s.companyA}/amendment`, { token: T, body: { ...base, proposedEffectiveFrom: min } })
check('014.aditivo-30-dias-salva', okSave.status === 200, `${min}: ${okSave.status} ${j(okSave.body)}`)

const prev = await api('POST', `/admin/billing/clients/${s.companyA}/documents/preview`, { token: T, body: {} })
console.log('preview aditivo', prev.status, prev.body.kind, 'missing', j(prev.body.missing), 'increase', prev.body.priceIncrease, 'min', prev.body.minimumEffectiveFrom)
const n0 = lastEmailN()
const send = await api('POST', `/admin/billing/clients/${s.companyA}/documents/send`, { token: T, body: {} })
console.log('send aditivo', send.status, send.body.document?.kind, send.body.emailSent)
s.docA2 = send.body.document.id
const toAll = emailsSince(n0).flatMap((m) => m.body.to)
check('014.aditivo-email-so-maria', j(toAll) === j(['maria@exemplo.test']), j(toAll))

const view = await api('GET', `/billing/me/documents/${s.docA2}`, { token: s.mariaToken })
const acc = await api('POST', `/billing/me/documents/${s.docA2}/accept`, { token: s.mariaToken, body: { sha256: sha256(view.body.renderedBody) } })
const terms = sqlJson(`select version, t.status, origin, "effectiveFrom", "proposedEffectiveFrom", "packagePrice"::text pp, "licenseType" from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}' order by version`)
const intel = sql(`select "intelligenceEnabled" from companies where id='${s.companyA}'`)
const me = await api('GET', '/billing/me', { token: s.mariaToken })
const v2 = terms.find((t) => t.version === 2)
// 00:01 de São Paulo do dia mínimo = 03:01 UTC
check('014.aditivo-aceito-futuro', acc.status === 200 && v2?.status === 'EFFECTIVE' && v2.effectiveFrom === `${min}T03:01:00` && intel === 'f' && me.body.currentTerms?.licenseType === 'STANDARD' && me.body.scheduledTerms?.licenseType === 'INTELLIGENCE',
  `aceite=${acc.status} v2=${j(v2)} intel=${intel} current=${me.body.currentTerms?.licenseType}/${me.body.currentTerms?.packagePrice} scheduled=${me.body.scheduledTerms?.licenseType}/${me.body.scheduledTerms?.effectiveFrom}`)

// Outro aditivo enquanto o aceito não vale → 409
const another = await api('PUT', `/admin/billing/clients/${s.companyA}/amendment`, { token: T, body: { ...base, licenseType: 'STANDARD', packagePrice: '1800.00', proposedEffectiveFrom: null } })
check('014.aditivo-enquanto-agendado-409', another.status === 409 && another.body.code === 'AMENDMENT_NOT_YET_EFFECTIVE', `${another.status} ${another.body.code}`)

// Publicar uma versão nova do contrato não muda o documento aceito
const tpl = await api('POST', '/admin/billing/contract-templates', { token: T, body: { kind: 'CONTRACT', fromTemplateId: s.templates.CONTRACT } })
if (tpl.status === 201) {
  const full = (await api('GET', `/admin/billing/contract-templates/${tpl.body.id}`, { token: T })).body
  await api('PUT', `/admin/billing/contract-templates/${tpl.body.id}`, { token: T, body: { body: full.body + '\n\nCláusula de teste e2e da versão nova.', changeNote: 'e2e v2' } })
  const pub = await api('POST', `/admin/billing/contract-templates/${tpl.body.id}/publish`, { token: T })
  const docNow = await api('GET', `/billing/me/documents/${s.docA}`, { token: s.mariaToken })
  check('014.nova-versao-nao-muda-aceito', pub.status === 200 && docNow.body.sha256 === sha256(docNow.body.renderedBody) && docNow.body.templateVersion === 1 && !docNow.body.renderedBody.includes('teste e2e da versão nova'),
    `publicada v${pub.body.version}; doc aceito templateVersion=${docNow.body.templateVersion} hash confere=${docNow.body.sha256 === sha256(docNow.body.renderedBody)}`)
  const docs = await api('GET', `/admin/billing/clients/${s.companyA}/documents`, { token: T })
  console.log('conditions', j(docs.body.conditions))
} else {
  record('014.nova-versao-nao-muda-aceito', 'NÃO TESTADO', `criar v2: ${tpl.status} ${j(tpl.body)}`)
}
s.amendMin = min
save(s)
