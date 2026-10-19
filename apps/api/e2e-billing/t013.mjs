import { api, login, load, save, sql, sqlJson, check, record, j } from './lib.mjs'

const s = load()
const sa = await login('superadmin@exemplo.test')
s.saToken = sa.accessToken
s.saId = sa.user.id

const profile = (n) => ({
  legalName: `Cliente ${n} Comércio de Teste Ltda`,
  tradeName: `Cliente ${n}`,
  stateRegistration: '123456789',
  addressStreet: 'Rua das Palmeiras',
  addressNumber: '100',
  addressComplement: 'Sala 2',
  addressDistrict: 'Centro',
  addressCity: 'Campinas',
  addressState: 'SP',
  addressZip: '13010-000',
  legalRepName: `Representante ${n}`,
  legalRepCpf: '529.982.247-25',
  legalRepRole: 'Sócio-administrador',
  contactName: `Contato ${n}`,
  contactEmail: `contato.${n.toLowerCase()}@exemplo.test`,
  contactPhone: '(19) 99999-0000',
  billingContactName: `Financeiro ${n}`,
  billingEmail: `financeiro.${n.toLowerCase()}@exemplo.test`,
  billingPhone: '(19) 98888-0000',
  notes: 'Cliente de teste e2e',
})

async function createClient(n, cnpj) {
  const ex = sql(`select id from companies where cnpj='${cnpj}'`)
  if (ex) return ex
  const r = await api('POST', '/companies', { token: s.saToken, body: { name: `Cliente ${n}`, cnpj, profile: profile(n) } })
  if (r.status !== 201) throw new Error(`create ${n}: ${r.status} ${j(r.body)}`)
  return r.body.id
}

s.companyA = await createClient('Alfa', '11.111.111/0001-11')
s.companyB = await createClient('Beta', '22.222.222/0001-22')
s.companyC = await createClient('Gama', '33.333.333/0001-33')
s.companyD = await createClient('Delta', '44.444.444/0001-44')
s.companyE = await createClient('Epsilon', '55.555.555/0001-55')
record('013.cadastro', 'PASSOU', `5 empresas criadas com profile: A=${s.companyA}`)

const pk = await api('GET', '/admin/billing/packages', { token: s.saToken })
s.packages = Object.fromEntries(pk.body.map((p) => [p.code, p.id]))

const draft = await api('PUT', `/admin/billing/clients/${s.companyA}/contract`, {
  token: s.saToken,
  body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1800.00', extraSeatPrice: '99.00', graceMonths: 0, dueDay: 10 },
})
console.log('draft', draft.status, j(draft.body).slice(0, 600))
const terms = sqlJson(`select t."packagePrice"::text pp, t."extraSeatPrice"::text ep, t."includedSeats", t.status, t.version, c.status cstatus, c."dueDay", c."graceMonths" from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}'`)
check('013.decimal', terms.length === 1 && terms[0].pp === '1800.00' && terms[0].ep === '99.00', `DB: ${j(terms)}; resp packagePrice=${j(draft.body?.terms?.[0]?.packagePrice ?? draft.body?.currentTerms ?? null)}`)

// Valor com centavos e valor grande
const draft2 = await api('PUT', `/admin/billing/clients/${s.companyA}/contract`, {
  token: s.saToken,
  body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1800.10', extraSeatPrice: '0.20', graceMonths: 0, dueDay: 10 },
})
const t2 = sqlJson(`select t."packagePrice"::text pp, t."extraSeatPrice"::text ep, t.version from billing_contract_terms t join billing_company_contracts c on c.id=t."contractId" where c."companyId"='${s.companyA}'`)
check('013.decimal-centavos', draft2.status === 200 && t2[0].pp === '1800.10' && t2[0].ep === '0.20' && t2.length === 1, `edição no lugar: ${j(t2)}`)
// volta a 1800.00
await api('PUT', `/admin/billing/clients/${s.companyA}/contract`, {
  token: s.saToken,
  body: { packageId: s.packages.P10, licenseType: 'STANDARD', extraSeats: 0, packagePrice: '1800.00', extraSeatPrice: '99.00', graceMonths: 0, dueDay: 10 },
})
const ev = sqlJson(`select type, payload from billing_events where "companyId"='${s.companyA}' order by "createdAt"`)
console.log('events A', j(ev))

const client = await api('GET', `/admin/billing/clients/${s.companyA}`, { token: s.saToken })
console.log('client A', client.status, j(client.body).slice(0, 1500))
save(s)
