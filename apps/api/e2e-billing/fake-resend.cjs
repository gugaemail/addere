// Resend falso: aceita qualquer POST, grava o corpo em emails.jsonl e responde
// {"id":"fake-<n>"}. GET/POST /__mode?fail=1 passa a responder 500 (para testar
// o aviso que não pode ser gravado quando o envio falha); fail=0 volta ao normal.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const OUT = path.join(__dirname, 'logs', 'emails.jsonl')
// Continua a numeração do arquivo: reiniciar o falso não repete o n
let n = 0
try { n = fs.readFileSync(OUT, 'utf8').split(/\r?\n/).filter(Boolean).length } catch {}
let fail = false
http
  .createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      if (url.pathname === '/__mode') {
        fail = url.searchParams.get('fail') === '1'
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ fail }))
      }
      n++
      let parsed = body
      try { parsed = JSON.parse(body) } catch {}
      const rec = {
        n,
        at: new Date().toISOString(),
        method: req.method,
        path: url.pathname,
        idempotencyKey: req.headers['idempotency-key'] ?? null,
        auth: (req.headers['authorization'] || '').slice(0, 14),
        failed: fail,
        body: parsed,
      }
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n')
      if (fail) {
        res.writeHead(500, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ name: 'internal_server_error', message: 'fake failure', statusCode: 500 }))
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: `fake-${n}` }))
    })
  })
  .listen(3999, '127.0.0.1', () => console.log('fake resend on 3999'))
