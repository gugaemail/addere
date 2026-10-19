// A5 — e-mail repetido: a resposta nunca carrega a mensagem crua do Prisma
import fs from 'node:fs'
import path from 'node:path'
import { api, load, sql, j, DIR, DB } from './lib.mjs'
const s = load()
const T = s.saToken
const sc = (r) => `${r.status}${r.body?.code ? ':' + r.body.code : ''}`
const leaky = (r) => /invocation|prisma|\.ts:\d|users\.service/i.test(JSON.stringify(r.body ?? ''))
const out = {}
const tag = Date.now().toString(36)
const companyId = s.companyD

// 1. Três criações simultâneas com o mesmo e-mail (a checagem fica fora da transação)
const body = { name: 'Dup', email: `dup-${tag}@exemplo.test`, password: 'E2e-Senha-123', role: 'ADMIN', companyId }
const rs = await Promise.all([0, 1, 2].map(() => api('POST', '/users', { token: T, body })))
out.simultaneas = rs.map((r) => `${sc(r)} ${(r.body?.message ?? '').replace(/\s+/g, ' ').slice(0, 70)}`)
out.vazou_simultaneas = rs.filter(leaky).length

// 2. A mesma de novo, depois: a checagem de antes pega
const again = await api('POST', '/users', { token: T, body })
out.repetida = `${sc(again)} ${again.body?.message}`

// 3. PATCH trocando o e-mail para um que já existe
const other = await api('POST', '/users', { token: T, body: { ...body, email: `dup2-${tag}@exemplo.test` } })
const p = await api('PATCH', `/users/${other.body.id}`, { token: T, body: { email: body.email } })
out.patch_email_existente = `${sc(p)} ${(p.body?.message ?? '').replace(/\s+/g, ' ').slice(0, 70)}`
out.vazou_patch = leaky(p) ? 1 : 0

// 4. Os usuários criados: um só com o e-mail
out.usuarios_com_o_email = Number(sql(`select count(*) from users where email='${body.email}'`))
console.log('A5', j(out))
fs.appendFileSync(path.join(DIR, 'a4a5.jsonl'), j({ at: new Date().toISOString(), db: DB, a5: out }) + '\n')
