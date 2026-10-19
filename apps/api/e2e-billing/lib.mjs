// Harness do e2e: HTTP contra a API local, SQL no Postgres local (docker exec),
// estado persistido em state.json e leitura dos e-mails do Resend falso.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

export const DIR = path.dirname(fileURLToPath(import.meta.url))
export const BASE = 'http://127.0.0.1:3334'
export const DB = process.env.E2E_DB ?? 'addere_e2e'
const CONTAINER = process.env.E2E_CONTAINER ?? 'addere-e2e-db'
const STATE = path.join(DIR, `state-${DB}.json`)
const EMAILS = path.join(DIR, 'logs', 'emails.jsonl')

export function load() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} }
}
export function save(s) { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)) }

let ipSeq = Math.floor(Math.random() * 200)
export function fakeIp() { ipSeq = (ipSeq + 1) % 250; return `10.77.${Math.floor(Math.random()*250)}.${ipSeq + 1}` }

export async function api(method, p, { token, body, headers = {}, ip } = {}) {
  const h = { ...headers }
  if (token) h.authorization = `Bearer ${token}`
  if (body !== undefined) h['content-type'] = 'application/json'
  h['x-forwarded-for'] = ip ?? fakeIp()
  const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

export async function login(email, password = 'E2e-Senha-123') {
  const r = await api('POST', '/auth/login', { body: { email, password } })
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body
}

export function sql(q) {
  const out = execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'addere_dev_user', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', q], { encoding: 'utf8' })
  return out.trim()
}
export function sqlRows(q) {
  const out = sql(q)
  return out === '' ? [] : out.split('\n').map((l) => l.split('|'))
}
export function sqlJson(q) {
  const out = sql(`select coalesce(json_agg(t), '[]'::json) from (${q}) t`)
  return JSON.parse(out)
}

export function emails() {
  try {
    return fs.readFileSync(EMAILS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch { return [] }
}
export function emailsSince(n) { return emails().filter((e) => e.n > n) }
export function lastEmailN() { const e = emails(); return e.length ? e[e.length - 1].n : 0 }
export async function setMailFail(fail) {
  const r = await fetch(`http://127.0.0.1:3999/__mode?fail=${fail ? 1 : 0}`)
  return r.json()
}

export function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex') }

const results = []
export function record(id, status, evidence) {
  const line = { id, status, evidence }
  results.push(line)
  console.log(`[${status}] ${id} — ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`)
  fs.appendFileSync(path.join(DIR, `results-${DB}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...line }) + '\n')
}
export function check(id, cond, evidence) { record(id, cond ? 'PASSOU' : 'FALHOU', evidence); return cond }
export function j(x) { return JSON.stringify(x) }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
