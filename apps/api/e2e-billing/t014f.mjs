// 014 — troca na data: o aditivo aceito da A (v2, Com Inteligência) passa a valer.
// node t014f.mjs move   → põe o effectiveFrom da v2 no passado (só o banco local)
// (reinicie a API: o ticker do boot aplica a Inteligência)
// node t014f.mjs check  → confere a Inteligência ligada e o INTELLIGENCE_APPLIED v2
import { load, sql, sqlJson, check, j } from './lib.mjs'
const s = load()
const step = process.argv[2]
if (step === 'move') {
  sql(`update billing_contract_terms t set "effectiveFrom" = (select t1."effectiveFrom" + interval '1 second' from billing_contract_terms t1 where t1."contractId"=t."contractId" and t1.version=1) from billing_company_contracts c where c.id=t."contractId" and c."companyId"='${s.companyA}' and t.version=2`)
  console.log(j(sqlJson(`select version, t.status, "effectiveFrom" from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}' order by version`)))
} else {
  const intel = sql(`select "intelligenceEnabled" from companies where id='${s.companyA}'`)
  const ev = sqlJson(`select payload from billing_events where "companyId"='${s.companyA}' and type='INTELLIGENCE_APPLIED' order by "createdAt"`)
  check('014.troca-na-data-ticker', intel === 't' && ev.some((e) => e.payload.termsVersion === 2), `intelligenceEnabled=${intel} eventos=${j(ev.map((e) => e.payload))}`)
}
