// 014 — aditivo "a pedido da Empresa" com aumento: vale no aceite e liga a Inteligência na hora
import { api, login, load, sql, sqlJson, check, j, sha256 } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
// Uma empresa do race2 (aditivo aceito ou em aberto): node t014e.mjs <tag> <k>
const rtag = process.argv[2] ?? 'a'
const rk = process.argv[3] ?? '10'
const cid = sql(`select id from companies where name='Aditivo ${rtag}${rk}'`)
const tok = (await login(`adm-ad-${rtag}${rk}@exemplo.test`)).accessToken
const wd = await api('POST', `/admin/billing/clients/${cid}/amendment/withdraw`, { token: T })
const base = { packageId: s.packages.P10, licenseType: 'INTELLIGENCE', extraSeats: 0, packagePrice: '1500.00', extraSeatPrice: '10.00', requestedByClient: true }
const noReason = await api('PUT', `/admin/billing/clients/${cid}/amendment`, { token: T, body: { ...base, reason: ' ' } })
const sv = await api('PUT', `/admin/billing/clients/${cid}/amendment`, { token: T, body: { ...base, reason: 'A Empresa pediu o upgrade para Com Inteligência' } })
const sd = await api('POST', `/admin/billing/clients/${cid}/documents/send`, { token: T, body: {} })
const v = await api('GET', `/billing/me/documents/${sd.body.document?.id}`, { token: tok })
const before = sql(`select "intelligenceEnabled" from companies where id='${cid}'`)
const acc = await api('POST', `/billing/me/documents/${sd.body.document?.id}/accept`, { token: tok, body: { sha256: sha256(v.body.renderedBody) } })
const terms = sqlJson(`select version, t.status, "licenseType", "packagePrice"::text pp, "effectiveFrom" <= now() at time zone 'UTC' as vale from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${cid}' order by version`)
const after = sql(`select "intelligenceEnabled" from companies where id='${cid}'`)
check('014.aditivo-a-pedido-vale-no-aceite', wd.status === 200 && noReason.status === 400 && sv.status === 200 && sd.status === 201 && acc.status === 200 && before === 'f' && after === 't' && terms.at(-1).status === 'EFFECTIVE' && terms.at(-1).vale === true,
  `descartar=${sc(wd)} sem motivo=${sc(noReason)} salvar=${sc(sv)} enviar=${sc(sd)} aceitar=${sc(acc)} intel ${before}→${after} termos=${j(terms)}`)
