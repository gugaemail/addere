// Uso: node logstat.cjs <regex-da-url> — lista reqId, método, url e status das requisições do api.log
const fs = require('fs')
const re = new RegExp(process.argv[2])
const reqs = new Map()
for (const line of fs.readFileSync(`${__dirname}/logs/api-${process.env.E2E_DB ?? 'addere_e2e'}.log`, 'utf8').split('\n')) {
  if (!line.startsWith('{')) continue
  let o; try { o = JSON.parse(line) } catch { continue }
  if (o.req) reqs.set(o.reqId, { m: o.req.method, u: o.req.url, t: o.time })
  if (o.res && reqs.has(o.reqId)) reqs.get(o.reqId).s = o.res.statusCode
}
for (const [id, r] of reqs) if (re.test(r.u)) console.log(id, r.m, r.u, r.s)
