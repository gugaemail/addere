// 014 — modelos: publicar v1 com marca é recusado; criar v2 sem marcas e publicar
import { api, load, save, check, record, j } from './lib.mjs'
const s = load()
const T = s.saToken

const list = await api('GET', '/admin/billing/contract-templates', { token: T })
console.log('templates', j(list.body))
const v1 = Object.fromEntries(list.body.filter((t) => t.version === 1).map((t) => [t.kind, t.id]))

const pub1 = await api('POST', `/admin/billing/contract-templates/${v1.CONTRACT}/publish`, { token: T })
check('014.publicar-v1-com-marca', pub1.status === 422 && pub1.body.code === 'TEMPLATE_NOT_PUBLISHABLE', `${pub1.status} ${pub1.body.code} issues=${pub1.body.details?.issues?.length}`)
const pub1a = await api('POST', `/admin/billing/contract-templates/${v1.AMENDMENT}/publish`, { token: T })
check('014.publicar-v1-aditivo-com-marca', pub1a.status === 422 && pub1a.body.code === 'TEMPLATE_NOT_PUBLISHABLE', `${pub1a.status} ${pub1a.body.code}`)

s.templates = {}
for (const kind of ['CONTRACT', 'AMENDMENT']) {
  const c = await api('POST', '/admin/billing/contract-templates', { token: T, body: { kind, fromTemplateId: v1[kind] } })
  console.log(`create v2 ${kind}:`, c.status, j(c.body).slice(0, 300))
  let target
  if (c.status === 201) {
    target = c.body
    record(`014.criar-v2-${kind}`, 'PASSOU', `v${c.body.version} criada a partir da v1`)
  } else {
    record(`014.criar-v2-${kind}`, 'FALHOU', `${c.status} ${c.body.code}: ${c.body.message} — não dá para criar a v2 com a v1 em DRAFT; seguindo com a v1 editada`)
    target = (await api('GET', `/admin/billing/contract-templates/${v1[kind]}`, { token: T })).body
  }
  const full = (await api('GET', `/admin/billing/contract-templates/${target.id}`, { token: T })).body
  const stripped = full.body.replace(/\s*\[\[[^\]]*\]\]/g, '')
  const up = await api('PUT', `/admin/billing/contract-templates/${target.id}`, { token: T, body: { body: stripped, changeNote: 'e2e local: marcas retiradas' } })
  console.log('update', up.status, up.body.code ?? '')
  const pub = await api('POST', `/admin/billing/contract-templates/${target.id}/publish`, { token: T })
  check(`014.publicar-${kind}-sem-marca`, pub.status === 200 && pub.body.status === 'PUBLISHED', `${pub.status} v${pub.body.version} ${pub.body.status ?? j(pub.body).slice(0, 400)}`)
  s.templates[kind] = target.id
}
save(s)
